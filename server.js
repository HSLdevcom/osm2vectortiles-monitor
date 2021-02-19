import express from "express";
import { AZURE_TILES_CONTAINER, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, DAILY_TASK_SCHEDULE } from "./constants";
import { reportInfo, reportError } from "./reporter";
import { createScheduledImport, startScheduledImport } from "./schedule";

import {
    Aborter,
    BlockBlobURL,
    ContainerURL,
    ServiceURL,
    SharedKeyCredential,
    StorageURL,
  } from '@azure/storage-blob';



async function checkBlobLastModified() {
    const account = AZURE_STORAGE_ACCOUNT;
    const accountKey = AZURE_STORAGE_KEY;
    const containerName = AZURE_TILES_CONTAINER;

    const credentials = new SharedKeyCredential(account, accountKey);
    const pipeline = StorageURL.newPipeline(credentials);
    const serviceURL = new ServiceURL(`https://${account}.blob.core.windows.net`, pipeline);
    const aborter = Aborter.timeout(5 * 60000);
  
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
  
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, `tiles.mbtiles`);
    const properties = await blockBlobURL.getProperties(aborter);
    const lastModified = new Date(properties.lastModified).getTime();
    const currentTime = new Date().getTime();
    const timeDifferenceInDays = (currentTime-lastModified) / (24*3600000);
    const roundedDifference = Number((timeDifferenceInDays).toFixed(1));
    if (timeDifferenceInDays > 7) {
        reportError(`Tileset outdated. Tiles.mbtiles in "/${containerName}" container was last updated ${roundedDifference} days ago.`)
    } else {
        reportInfo(`Tiles.mbtiles in "/${containerName}" container was last updated ${roundedDifference} days ago.`)
    }

  }

createScheduledImport("checkTilesAge", DAILY_TASK_SCHEDULE, async (onComplete = () => {}) => {
    checkBlobLastModified()
    onComplete();
    return;
});



export const server = () => {
  const app = express();

  app.use(express.urlencoded({ extended: true }));

  app.listen(9000, () => {
    console.log(`Server is listening on port 9000`);
  });
};

startScheduledImport("checkTilesAge");
server();

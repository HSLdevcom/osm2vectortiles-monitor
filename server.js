import btoa from 'btoa';
import express from "express";
import fetch from "node-fetch";
import { AZURE_TILES_CONTAINER, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, DAILY_TASK_SCHEDULE, JORE_IMPORT_USERNAME, JORE_IMPORT_PASSWORD } from "./constants";
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

const MAX_DELAY = 7;

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
    if (timeDifferenceInDays > MAX_DELAY) {
        reportError(`Tileset outdated. Tiles.mbtiles in "/${containerName}" container was last updated ${roundedDifference} days ago.`)
    } else {
        reportInfo(`Tiles.mbtiles in "/${containerName}" container was last updated ${roundedDifference} days ago.`)
    }
  }

async function checkDockerImagesLastModified() {
  const dockerImageData = await fetch('https://hub.docker.com/v2/repositories/hsldevcom/hsl-map-server/tags/?page_size=10000')
  const dockerImageDataJson = await dockerImageData.json();
  let outDated = false;
  let message;
  dockerImageDataJson.results.forEach(result => {
    const name = result.name;
    const lastPushed = new Date(result.tag_last_pushed).getTime();
    const currentTime = new Date().getTime();
    const timeDifferenceInDays = (currentTime-lastPushed) / (24*3600000);
    const roundedDifference = Number((timeDifferenceInDays).toFixed(1));
    const newMessage = `${message ? message+', ' : ''}${name}: ${roundedDifference} days`;
    if (name === 'dev' || name === 'prod') {
      message = newMessage;
      if (roundedDifference > MAX_DELAY) {
        outDated = true;
      }
    }
  })

  if (outDated) {
      reportError(`Image or images outdated. Hsl-map-server dockerhub images last modified: ${message}`)
  } else {
      reportInfo(`Hsl-map-server dockerhub images last modified: ${message}`)
  }
}

async function checkJoreImport(endpoint) {
  const dockerImageData = await fetch(endpoint.url, {method:'GET',
      headers: {'Authorization': 'Basic ' + btoa(JORE_IMPORT_USERNAME + ":" + JORE_IMPORT_PASSWORD)}
  })
  const text = await dockerImageData.text();
  const utcsplit = text.split('UTC');
  const split = utcsplit[0].split('The import started at <strong>');

  const importStartDate = new Date(split[1]);
  const dateNow = new Date();
  const importStartMilliseconds = importStartDate.getTime();
  const dateNowMilliseconds = dateNow.getTime();
  const differenceInDays = (dateNowMilliseconds - importStartMilliseconds) / (24*3600000);
  if (differenceInDays > MAX_DELAY) {
     reportError(`Jore-import (${endpoint.env}) last started ${Number((differenceInDays).toFixed(1))} days ago.`)
  }
  if (!differenceInDays) {
     reportError(`Jore-import (${endpoint.env}) is not responding.`)
  }
}

function checkJoreImports() {
  const endpoints = [
    {url: 'https://dev.kartat.hsl.fi/jore-import/', env: 'dev'},
    {url: 'https://stage.kartat.hsl.fi/jore-import/', env: 'stage'},
    {url: 'https://prod.kartat.hsl.fi/jore-import/', env: 'prod'}
  ];
  endpoints.forEach(endpoint => checkJoreImport(endpoint));
}

createScheduledImport("checkTilesAge", DAILY_TASK_SCHEDULE, async (onComplete = () => {}) => {
    checkBlobLastModified()
    checkDockerImagesLastModified();
    checkJoreImports();
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

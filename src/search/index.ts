import elasticsearch from "elasticsearch";

import { IConfig } from "../config/schema";
import * as logger from "../utils/logger";
import { buildActorIndex } from "./actor";
import { buildImageIndex } from "./image";
import { MAX_RESULT } from "./internal/constants";
import { buildMarkerIndex } from "./marker";
import { buildMovieIndex } from "./movie";
import { buildSceneIndex } from "./scene";
import { buildStudioIndex } from "./studio";

let client = new elasticsearch.Client({
  host: "localhost:9200",
  log: "error",
  apiVersion: "7.x",
});

export function refreshClient(config: IConfig) {
  logger.log("Refresh ES client");
  client = new elasticsearch.Client({
    host: config.search.host,
    log: config.search.log ? "trace" : "error",
    apiVersion: config.search.version,
    httpAuth: config.search.auth || undefined,
  });
}

export function getClient() {
  return client;
}

function formatName(name: string) {
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    return `pv-${name}`;
  }
  return `pv-${process.env.NODE_ENV}-${name}`;
}

export const indexMap = {
  scenes: formatName("scenes"),
  actors: formatName("actors"),
  images: formatName("images"),
  studios: formatName("studios"),
  movies: formatName("movies"),
  markers: formatName("markers"),
};

const indices = Object.values(indexMap);

export async function clearIndices() {
  for (const index of indices) {
    try {
      logger.log(`Deleting ${index}`);
      await client.indices.delete({ index });
    } catch (error) {
      const _err = error as Error;
      logger.log(_err.message);
    }
  }
  logger.log("Wiped Elasticsearch");
}

async function ensureIndexExists(name: string): Promise<boolean> {
  logger.log(`Checking index ${name}`);
  if (!(await client.indices.exists({ index: name }))) {
    await client.indices.create({
      index: name,
    });
    await client.indices.putSettings({
      index: name,
      body: {
        "index.max_result_window": MAX_RESULT,
      },
    });
    logger.log(`Created index ${name}`);
    return true;
  }
  return false;
}

export async function ensureIndices(wipeData: boolean) {
  if (wipeData) {
    await clearIndices();
  }

  for (const indexKey in indexMap) {
    const created = await ensureIndexExists(indexMap[indexKey]);
    if (created) {
      const buildIndexMap: Record<string, () => Promise<void>> = {
        scenes: buildSceneIndex,
        actors: buildActorIndex,
        images: buildImageIndex,
        studios: buildStudioIndex,
        movies: buildMovieIndex,
        markers: buildMarkerIndex,
      };
      await buildIndexMap[indexKey]();
    }
  }
}

export async function buildIndices(): Promise<void> {
  await buildActorIndex();
  await buildSceneIndex();
  await buildImageIndex();
  await buildMovieIndex();
  await buildStudioIndex();
  await buildMarkerIndex();
}

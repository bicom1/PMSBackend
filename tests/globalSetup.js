import fs from 'fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const uriFile = new URL('./.mongo-uri', import.meta.url);
let replica;

export async function setup() {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ launchTimeout: 120000 }],
  });
  fs.writeFileSync(uriFile, replica.getUri());
}

export async function teardown() {
  if (replica) await replica.stop();
  fs.rmSync(uriFile, { force: true });
}

import { envs } from './env-setup.js';
import {
  createActorInputForSearchSpace,
  parseLocalCliOptions,
  resolveSearchSpaceMongoDbName,
  writeLocalActorInput,
} from './search-space.js';

async function main(): Promise<void> {
  const cliOptions = parseLocalCliOptions(process.argv.slice(2));
  const { searchSpace, actorInput } = await createActorInputForSearchSpace(cliOptions);
  const outputPath = await writeLocalActorInput(actorInput, cliOptions.outputPath);
  const resolvedMongoDbName = resolveSearchSpaceMongoDbName({
    dbPrefix: envs.JOB_COMPASS_DB_PREFIX,
    searchSpaceId: actorInput.searchSpaceId,
    explicitDbName: envs.MONGODB_DB_NAME,
  });

  console.log(
    JSON.stringify(
      {
        prepared: true,
        searchSpaceId: searchSpace.searchSpaceId,
        description: searchSpace.description,
        outputPath,
        resolvedMongoDbName,
        actorInput,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

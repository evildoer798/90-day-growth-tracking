import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { prisma } from "@/server/db/prisma";
import {
  applyTrainingPlanImport,
  prepareTrainingPlanImport,
} from "@/server/services/training-plan-import.service";

interface CliOptions {
  file: string;
  apply: boolean;
  actorId: string | null;
}

const readOptionValue = (args: readonly string[], index: number, name: string): string => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
};

const parseOptions = (args: readonly string[]): CliOptions => {
  let file = resolve(
    process.cwd(),
    "data/imports/新人90天学习计划_网站导入版.xlsx",
  );
  let apply = false;
  let actorId: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--file") {
      file = resolve(readOptionValue(args, index, "--file"));
      index += 1;
    } else if (argument === "--actor") {
      actorId = readOptionValue(args, index, "--actor");
      index += 1;
    } else if (argument === "--apply") {
      apply = true;
    } else if (argument === "--preview") {
      apply = false;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (apply && !actorId) {
    throw new Error("--apply requires --actor <user-id>");
  }
  return { file, apply, actorId };
};

const main = async () => {
  const options = parseOptions(process.argv.slice(2));
  const { preview, trainingPlan } = await prepareTrainingPlanImport(
    await readFile(options.file),
  );

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          mode: "preview",
          file: options.file,
          canApply: preview.canApply,
          counts: preview.counts,
          items: preview.items.map(({ classification, stableImportKey, message }) => ({
            classification,
            stableImportKey,
            message,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!options.actorId) {
    throw new Error("--apply requires --actor <user-id>");
  }
  const batch = await applyTrainingPlanImport(preview, options.actorId, { trainingPlan });
  console.log(
    JSON.stringify(
      {
        mode: "applied",
        batchId: batch.id,
        status: batch.status,
        counts: preview.counts,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

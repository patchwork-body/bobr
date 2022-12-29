#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers'
import { execSync } from 'node:child_process';

yargs(hideBin(process.argv))
  .command('dev', 'start local dynamodb', (yargs) => yargs, () => {
    execSync('node ./bin/bobr.js dev | pino-pretty', { stdio: 'inherit' });
  })

  .command(
    'gen', 'Generate', (yargs) => yargs, () => {
      execSync('node ./bin/bobr.js gen | pino-pretty', { stdio: 'inherit' });
    },
  )
  .parse();


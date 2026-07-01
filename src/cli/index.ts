#!/usr/bin/env node
import { checkForUpdate, renderUpdateHint } from '../core/update-check';
import { createProgram } from './program';

checkForUpdate()
  .then((result) => {
    if (result) {
      process.stderr.write(`${renderUpdateHint(result)}\n`);
    }
  })
  .catch(() => {
    // Update checks must never break CLI execution.
  });

createProgram().parse();

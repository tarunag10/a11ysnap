import chalk from "chalk";
import ora from "ora";

let verbose = false;
let spinner = null;

export function setVerbose(v) {
  verbose = v;
}

export function info(msg) {
  if (spinner) spinner.stop();
  console.log(chalk.blue("ℹ"), msg);
  if (spinner) spinner.start();
}

export function success(msg) {
  if (spinner) spinner.stop();
  console.log(chalk.green("✓"), msg);
  if (spinner) spinner.start();
}

export function warn(msg) {
  if (spinner) spinner.stop();
  console.log(chalk.yellow("⚠"), msg);
  if (spinner) spinner.start();
}

export function error(msg) {
  if (spinner) spinner.stop();
  console.error(chalk.red("✖"), msg);
}

export function debug(msg) {
  if (verbose) {
    if (spinner) spinner.stop();
    console.log(chalk.gray("  →"), msg);
    if (spinner) spinner.start();
  }
}

export function startSpinner(msg) {
  spinner = ora(msg).start();
  return spinner;
}

export function stopSpinner() {
  if (spinner) {
    spinner.stop();
    spinner = null;
  }
}

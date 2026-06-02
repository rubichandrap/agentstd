import pc from 'picocolors';

export const log = {
  info(msg: string): void {
    console.log(pc.blue('ℹ'), msg);
  },
  success(msg: string): void {
    console.log(pc.green('✓'), msg);
  },
  warn(msg: string): void {
    console.log(pc.yellow('⚠'), msg);
  },
  error(msg: string): void {
    console.log(pc.red('✗'), msg);
  },
  dim(msg: string): void {
    console.log(pc.dim(msg));
  },
};

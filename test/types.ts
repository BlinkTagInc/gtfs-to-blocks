import {
  exportBlocks,
  type BlocksConfig,
  type BlocksExportOptions,
} from '../dist/index.js';

const options: BlocksExportOptions = {
  serviceDate: 20261110,
  deadheads: false,
};
const config: BlocksConfig = {
  sources: [
    {
      sourceId: 'bus',
      schedule: {
        path: './feed.zip',
        import: { validation: { onDuplicateKey: 'reject' } },
      },
    },
  ],
  export: options,
  reporting: {
    level: 'silent',
    reporter(event) {
      void event;
    },
  },
};
const result: Promise<string> = exportBlocks(config);
void result;

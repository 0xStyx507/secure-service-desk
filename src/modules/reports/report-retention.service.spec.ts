import type { Model } from 'mongoose';
import { mongo } from 'mongoose';
import { ReportRetentionService } from './report-retention.service';
import { ReportStatus } from './report-status.enum';
import type { ReportDocument } from './schemas/report.schema';

function queryResult<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function findResult<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function buildService(reportModel: Partial<Model<ReportDocument>>, database = {}) {
  return new ReportRetentionService(
    reportModel as Model<ReportDocument>,
    { db: database } as never,
    { get: jest.fn().mockReturnValue(60_000) } as never,
  );
}

describe('ReportRetentionService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the file reference and a retryable status when GridFS deletion fails', async () => {
    const updateOne = jest.fn().mockReturnValue(queryResult({ modifiedCount: 1 }));
    const report = {
      id: 'report-1',
      _id: 'report-1',
      fileId: { toString: () => '507f1f77bcf86cd799439011' },
      status: ReportStatus.COMPLETED,
    };
    const reportModel = {
      find: jest.fn().mockReturnValue(findResult([report])),
      updateOne,
    };
    jest.spyOn(mongo, 'GridFSBucket').mockImplementation((() => ({
      delete: jest.fn().mockRejectedValue(new Error('token=must-not-leak')),
    })) as never);
    const service = buildService(reportModel);

    await expect(service.purgeExpiredFiles()).resolves.toBe(0);

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'report-1', status: ReportStatus.COMPLETED, fileId: report.fileId },
      { $set: { error: 'Retention purge failed: token=[REDACTED]' } },
    );
    expect(updateOne.mock.calls[0]?.[1]).not.toEqual(
      expect.objectContaining({ $set: expect.objectContaining({ status: ReportStatus.PURGED }) }),
    );
  });

  it('marks a report PURGED only after GridFS deletion succeeds', async () => {
    const updateOne = jest.fn().mockReturnValue(queryResult({ modifiedCount: 1 }));
    const report = {
      id: 'report-2',
      _id: 'report-2',
      fileId: { toString: () => '507f1f77bcf86cd799439012' },
      status: ReportStatus.COMPLETED,
    };
    const reportModel = {
      find: jest.fn().mockReturnValue(findResult([report])),
      updateOne,
    };
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(mongo, 'GridFSBucket').mockImplementation((() => ({ delete: deleteFile })) as never);
    const service = buildService(reportModel);

    await expect(service.purgeExpiredFiles()).resolves.toBe(1);

    expect(deleteFile).toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'report-2', status: ReportStatus.COMPLETED, fileId: report.fileId },
      expect.objectContaining({
        $set: expect.objectContaining({ status: ReportStatus.PURGED }),
        $unset: { fileId: 1, error: 1 },
      }),
    );
  });

  it('does not run overlapping purge cycles in the same instance', async () => {
    let releaseDelete!: () => void;
    const deleteFile = jest.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        releaseDelete = resolve;
      }),
    );
    const reportModel = {
      find: jest.fn().mockReturnValue(
        findResult([
          {
            id: 'report-3',
            _id: 'report-3',
            fileId: { toString: () => '507f1f77bcf86cd799439013' },
            status: ReportStatus.COMPLETED,
          },
        ]),
      ),
      updateOne: jest.fn().mockReturnValue(queryResult({ modifiedCount: 1 })),
    };
    jest.spyOn(mongo, 'GridFSBucket').mockImplementation((() => ({ delete: deleteFile })) as never);
    const service = buildService(reportModel);

    const first = service.purgeExpiredFiles();
    const second = service.purgeExpiredFiles();
    releaseDelete();

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(1);
    expect(reportModel.find).toHaveBeenCalledTimes(1);
  });
});

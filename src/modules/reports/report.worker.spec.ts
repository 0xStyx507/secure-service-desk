import type { Model } from 'mongoose';
import { ReportWorker } from './report.worker';
import { ReportStatus } from './report-status.enum';
import type { ReportDocument } from './schemas/report.schema';

function queryResult<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function buildWorker(reportModel: Partial<Model<ReportDocument>>) {
  return new ReportWorker(
    reportModel as Model<ReportDocument>,
    {} as never,
    { db: {} } as never,
    { record: jest.fn() } as never,
    { create: jest.fn() } as never,
    { capture: jest.fn() } as never,
    { get: jest.fn().mockReturnValue(30) } as never,
  );
}

describe('ReportWorker', () => {
  it('does not render a duplicate job after another worker claims the report', async () => {
    const reportModel = {
      findOneAndUpdate: jest.fn().mockReturnValue(queryResult(null)),
      findById: jest.fn().mockReturnValue(
        queryResult({
          status: ReportStatus.PROCESSING,
        }),
      ),
    };
    const worker = buildWorker(reportModel);
    const renderPdf = jest
      .spyOn(worker as unknown as { renderPdf: (...args: never[]) => Promise<Buffer> }, 'renderPdf')
      .mockResolvedValue(Buffer.from('pdf'));

    await expect(
      worker.process({
        id: 'report-job-1',
        data: { reportId: 'report-1', actorId: 'actor-1' },
      } as never),
    ).resolves.toEqual({ fileId: '' });

    expect(renderPdf).not.toHaveBeenCalled();
    expect(reportModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'report-1', status: ReportStatus.QUEUED },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: ReportStatus.PROCESSING,
          processingJobId: 'report-job-1',
        }),
      }),
      { new: true },
    );
  });

  it('returns the existing file for a completed duplicate job', async () => {
    const reportModel = {
      findOneAndUpdate: jest.fn().mockReturnValue(queryResult(null)),
      findById: jest.fn().mockReturnValue(
        queryResult({
          status: ReportStatus.COMPLETED,
          fileId: { toString: () => 'file-1' },
        }),
      ),
    };
    const worker = buildWorker(reportModel);

    await expect(
      worker.process({
        id: 'report-job-2',
        data: { reportId: 'report-1', actorId: 'actor-1' },
      } as never),
    ).resolves.toEqual({ fileId: 'file-1' });
  });

  it('returns a report to QUEUED after a retryable failure', async () => {
    const updateOne = jest.fn().mockResolvedValue({});
    const worker = buildWorker({ updateOne } as Partial<Model<ReportDocument>>);

    await worker.onFailed(
      {
        id: 'report-job-3',
        data: { reportId: 'report-1', actorId: 'actor-1' },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as never,
      new Error('temporary failure'),
    );

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'report-1', status: ReportStatus.PROCESSING, processingJobId: 'report-job-3' },
      {
        $set: { status: ReportStatus.QUEUED },
        $unset: { processingJobId: 1, processingAt: 1, error: 1 },
      },
    );
  });
});

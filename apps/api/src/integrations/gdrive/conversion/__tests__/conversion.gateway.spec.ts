import { ConversionGateway } from '../conversion.gateway';

describe('ConversionGateway', () => {
  it('starts a job, returns it by id, and status defaults to pending', () => {
    const g = new ConversionGateway();
    const { jobId, signal } = g.start('user-1');
    const job = g.get(jobId);
    expect(job?.status).toBe('pending');
    expect(job?.userId).toBe('user-1');
    expect(signal.aborted).toBe(false);
  });

  it('cancel() flips the status to cancelled and aborts the signal', () => {
    const g = new ConversionGateway();
    const { jobId, signal } = g.start('user-1');
    g.cancel(jobId, 'user-1');
    expect(g.get(jobId)?.status).toBe('cancelled');
    expect(signal.aborted).toBe(true);
  });

  it('cancel() is a no-op (returns false) when the userId does not own the job', () => {
    const g = new ConversionGateway();
    const { jobId, signal } = g.start('user-1');
    expect(g.cancel(jobId, 'user-2')).toBe(false);
    expect(g.get(jobId)?.status).toBe('pending');
    expect(signal.aborted).toBe(false);
  });

  it('markDone() promotes the status and stores the asset URL', () => {
    const g = new ConversionGateway();
    const { jobId } = g.start('user-1');
    g.markDone(jobId, 'https://signed/asset.pdf');
    expect(g.get(jobId)?.status).toBe('done');
    expect(g.get(jobId)?.assetUrl).toBe('https://signed/asset.pdf');
  });

  it('markFailed() promotes the status and records the error code', () => {
    const g = new ConversionGateway();
    const { jobId } = g.start('user-1');
    g.markFailed(jobId, 'conversion-failed');
    expect(g.get(jobId)?.status).toBe('failed');
    expect(g.get(jobId)?.errorCode).toBe('conversion-failed');
  });

  it('view() returns only id+status+assetUrl+errorCode (no AbortController leakage)', () => {
    const g = new ConversionGateway();
    const { jobId } = g.start('user-1');
    g.markDone(jobId, 'https://x');
    const view = g.view(jobId, 'user-1');
    expect(view).toEqual({ jobId, status: 'done', assetUrl: 'https://x' });
    expect(view).not.toHaveProperty('controller');
    expect(view).not.toHaveProperty('userId');
  });

  it('view() returns null when the user does not own the job (no existence leak)', () => {
    const g = new ConversionGateway();
    const { jobId } = g.start('user-1');
    expect(g.view(jobId, 'user-2')).toBeNull();
  });

  it('once a job reaches a terminal status, cancel() does not flip it back', () => {
    const g = new ConversionGateway();
    const { jobId } = g.start('user-1');
    g.markDone(jobId, 'https://x');
    g.cancel(jobId, 'user-1');
    expect(g.get(jobId)?.status).toBe('done');
  });
});

import type {
  CreateScanSessionResponse,
  ScanSessionPhoneView,
  ScanSessionUploadResult,
  ScanSessionView,
} from 'shared';
import { apiClient } from '@/lib/api/apiClient';

/** The URL the QR encodes: the phone side of a scan session. */
export function scanPhoneUrl(code: string, origin: string = window.location.origin): string {
  return `${origin}/scan/${encodeURIComponent(code)}`;
}

/** Owner: open a 10 minute scan session. */
export async function createScanSession(signal?: AbortSignal): Promise<CreateScanSessionResponse> {
  const { data } = await apiClient.post<CreateScanSessionResponse>(
    '/scan-sessions',
    {},
    signal ? { signal } : {},
  );
  return data;
}

/** Owner: poll the session. */
export async function getScanSession(code: string, signal?: AbortSignal): Promise<ScanSessionView> {
  const { data } = await apiClient.get<ScanSessionView>(
    `/scan-sessions/${encodeURIComponent(code)}`,
    signal ? { signal } : {},
  );
  return data;
}

/** Owner: take the PDF the phone sent. It can be taken once. */
export async function takeScanPdf(code: string, signal?: AbortSignal): Promise<File> {
  const { data } = await apiClient.get<Blob>(`/scan-sessions/${encodeURIComponent(code)}/pdf`, {
    responseType: 'blob',
    ...(signal ? { signal } : {}),
  });
  return new File([data], 'Scan.pdf', { type: 'application/pdf' });
}

/** Phone: is the code still good? No sign-in. */
export async function getPhoneScanSession(
  code: string,
  signal?: AbortSignal,
): Promise<ScanSessionPhoneView> {
  const { data } = await apiClient.get<ScanSessionPhoneView>(
    `/scan-sessions/${encodeURIComponent(code)}/phone`,
    signal ? { signal } : {},
  );
  return data;
}

/** Phone: send the finished PDF. Works once per code. */
export async function postScanPdf(
  code: string,
  pdf: File,
  signal?: AbortSignal,
): Promise<ScanSessionUploadResult> {
  const fd = new FormData();
  fd.append('file', pdf);
  const { data } = await apiClient.post<ScanSessionUploadResult>(
    `/scan-sessions/${encodeURIComponent(code)}/pdf`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' }, ...(signal ? { signal } : {}) },
  );
  return data;
}

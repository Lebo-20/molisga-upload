import localforage from 'localforage';

// 1. Configure LocalForage instances
export const draftsDb = localforage.createInstance({
  name: 'molis-report-system',
  storeName: 'drafts',
  description: 'Stores report forms autosaved drafts',
});

export const uploadQueueDb = localforage.createInstance({
  name: 'molis-report-system',
  storeName: 'upload-queue',
  description: 'Stores pending uploads for offline sync',
});

// Interface definitions
export interface FormDraft {
  spk_number?: string;
  buyer_name?: string;
  phone?: string;
  address?: string;
  date?: string;
  motor?: string;
  type?: string;
  color?: string;
  dp?: string;
  price?: string;
  payment_method?: string;
  updated_at: string;
}

export interface QueueFile {
  fieldName: string;
  fileName: string;
  mimeType: string;
  base64Data: string; // Base64 string for offline storage
}

export interface QueueItem {
  id: string;
  userEmail: string;
  userName: string;
  userRole: 'sales' | 'service';
  formData: Omit<FormDraft, 'updated_at'>;
  files: QueueFile[];
  timestamp: string;
  status: 'pending' | 'uploading' | 'failed';
  retries: number;
  error?: string;
}

// ==========================================
// DRAFTS STORAGE METHODS
// ==========================================

export async function saveDraft(userEmail: string, draft: FormDraft): Promise<void> {
  const key = `draft_${userEmail.toLowerCase()}`;
  await draftsDb.setItem(key, draft);
}

export async function getDraft(userEmail: string): Promise<FormDraft | null> {
  const key = `draft_${userEmail.toLowerCase()}`;
  return await draftsDb.getItem<FormDraft>(key);
}

export async function clearDraft(userEmail: string): Promise<void> {
  const key = `draft_${userEmail.toLowerCase()}`;
  await draftsDb.removeItem(key);
}

// ==========================================
// OFFLINE UPLOAD QUEUE METHODS
// ==========================================

export async function enqueueUpload(item: QueueItem): Promise<void> {
  await uploadQueueDb.setItem(item.id, item);
}

export async function getQueueItems(): Promise<QueueItem[]> {
  const items: QueueItem[] = [];
  await uploadQueueDb.iterate<QueueItem, void>((value) => {
    items.push(value);
  });
  // Sort by oldest first
  return items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export async function updateQueueItemStatus(
  id: string,
  status: QueueItem['status'],
  extra: Partial<Omit<QueueItem, 'id' | 'status'>> = {}
): Promise<QueueItem | null> {
  const item = await uploadQueueDb.getItem<QueueItem>(id);
  if (!item) return null;

  const updated: QueueItem = { ...item, status, ...extra };
  await uploadQueueDb.setItem(id, updated);
  return updated;
}

export async function dequeueUpload(id: string): Promise<void> {
  await uploadQueueDb.removeItem(id);
}

export async function getQueueCount(): Promise<number> {
  const keys = await uploadQueueDb.keys();
  return keys.length;
}

// Helper to convert File object to Base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Extract only the base64 part, removing the header "data:image/jpeg;base64,"
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

// Helper to convert Base64 string back to Blob / File
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

import { Attachment } from '../types';

export interface DriveUploadResult {
  ok: boolean;
  fileId?: string;
  fileName?: string;
  driveUrl?: string;
  folderName?: string;
  error?: string;
}

const DRIVE_UPLOAD_URL = (import.meta as any).env?.VITE_DRIVE_UPLOAD_URL || '';

// Apps Script 单次请求体上限约 6MB，base64 比原文件大约 1.33 倍
// 限制原始文件不超过 10MB，超出提示用户手动上传
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export async function uploadFileToDrive(
  att: Attachment,
  meta?: { businessType?: string; clientName?: string }
): Promise<DriveUploadResult> {
  console.log('[DriveService] DRIVE_UPLOAD_URL:', DRIVE_UPLOAD_URL || '⚠️ 未设置');

  if (!DRIVE_UPLOAD_URL) {
    return { ok: false, error: '未配置 VITE_DRIVE_UPLOAD_URL，请检查 .env.local 并重启开发服务器' };
  }

  if (!att.data) {
    return { ok: false, error: '附件没有文件数据（data 为空）' };
  }

  if (att.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `文件过大（${(att.size / 1024 / 1024).toFixed(1)}MB），请直接上传到 Google Drive 后粘贴链接` };
  }

  // 兼容带 data:xxx;base64, 前缀的格式，只传纯 base64 给 Apps Script
  const base64Data = att.data.includes(',') ? att.data.split(',')[1] : att.data;

  console.log('[DriveService] 开始上传:', att.name, att.type, `${(att.size/1024).toFixed(0)}KB`, meta);

  try {
    const response = await fetch(DRIVE_UPLOAD_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({
        action: 'uploadFileToDrive',
        base64Data,
        fileName: att.name,
        mimeType:  att.type,
        businessType: meta?.businessType || 'LOG_ONLY',
        clientName:   meta?.clientName   || '',
      }),
    });

    console.log('[DriveService] HTTP状态:', response.status, response.ok);

    if (!response.ok) {
      return { ok: false, error: `请求失败 HTTP ${response.status}` };
    }

    const rawText = await response.text();
    console.log('[DriveService] 原始响应:', rawText.slice(0, 300));

    let result: DriveUploadResult;
    try {
      result = JSON.parse(rawText);
    } catch {
      return { ok: false, error: `响应不是 JSON：${rawText.slice(0, 100)}` };
    }

    console.log('[DriveService] 解析结果:', result);
    return result;
  } catch (err: any) {
    console.error('[DriveService] fetch 异常:', err);
    return { ok: false, error: `网络错误：${err.message || '未知'}` };
  }
}

/**
 * 批量上传：并行上传所有有 data 的附件，返回替换后的附件数组。
 * 上传成功：data 清空，driveUrl 填入。
 * 上传失败：保留原始 data（降级兜底），不阻断提交。
 */
export async function uploadAllAttachmentsToDrive(
  attachments: Attachment[],
  meta?: { businessType?: string; clientName?: string }
): Promise<{ attachments: Attachment[]; failedCount: number }> {
  let failedCount = 0;

  const results = await Promise.all(
    attachments.map(async (att) => {
      // 已经上传过（有 driveUrl）或没有 data，跳过
      if (att.driveUrl || !att.data) return att;

      const result = await uploadFileToDrive(att, meta);
      if (result.ok && result.driveUrl) {
        return { ...att, data: '', driveUrl: result.driveUrl };
      } else {
        failedCount++;
        console.warn('[DriveService] 上传失败:', att.name, result.error);
        return att; // 保留 base64 作为兜底
      }
    })
  );

  return { attachments: results, failedCount };
}

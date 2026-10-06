import { useState } from 'react';

import type { Language } from '../i18n';
import {
  createLegacyFieldbookExport,
  readLegacyFieldbook,
  type LegacyFieldbookReadResult,
} from '../state/legacyFieldbook';
import InternalLink from './InternalLink';

export default function LegacyLearningArchive({ language }: { readonly language: Language }) {
  const zh = language === 'zh';
  const [record, setRecord] = useState<LegacyFieldbookReadResult | null>(null);
  const [downloadState, setDownloadState] = useState<'started' | 'error' | null>(null);

  const refresh = () => {
    // The browser may deny even access to the localStorage property. Keep that
    // access inside the adapter's guarded getItem call.
    setRecord(readLegacyFieldbook({ getItem: (key) => window.localStorage.getItem(key) }));
    setDownloadState(null);
  };

  const download = () => {
    if (record?.status !== 'available') return;
    try {
      const output = createLegacyFieldbookExport(record);
      const url = URL.createObjectURL(new Blob([output.content], { type: output.mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = output.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState('started');
    } catch {
      setDownloadState('error');
    }
  };

  return (
    <section className='section-block' id='legacy-learning' aria-labelledby='legacy-learning-title'>
      <div className='section-heading'>
        <p className='section-index'>EARLIER LEARNING RECORDS</p>
        <h2 id='legacy-learning-title'>{zh ? '旧手册记录，只读保留' : 'Read-only fieldbook records'}</h2>
      </div>
      <p>{zh
        ? '旧手册已停止维护，有用内容正在整合到学习地图。这里可以读取并导出当前浏览器留存的旧记录；不会修改、删除或迁移它，也不会把旧任务进度换算为新课程完成状态。'
        : 'The old fieldbook is retired. Its useful material is being integrated into the learning map. You can read and export records retained in this browser; they are not changed, deleted, migrated, or counted as new lesson completion.'}</p>
      <p>{zh
        ? '记录按站点地址和浏览器分别保存。本地预览不能读取线上站点、其他浏览器或另一台设备中的记录。旧手册没有保存的自我介绍草稿等内容，无法从这里恢复。'
        : 'Records belong to one site address and browser. A local preview cannot read records from the live site, another browser, or another device. Text never saved by the old fieldbook, such as an introduction draft, cannot be recovered here.'}</p>
      <div className='local-data-controls'>
        <button type='button' onClick={refresh}>{record
          ? (zh ? '重新读取旧记录' : 'Read again')
          : (zh ? '查看本机旧记录' : 'Read local records')}</button>
        {record?.status === 'available' && <button type='button' onClick={download}>
          {record.format === 'json'
            ? (zh ? '导出原始 JSON' : 'Export original JSON')
            : (zh ? '导出原始文本' : 'Export original text')}
        </button>}
        <InternalLink href='/learn/'>{zh ? '打开学习地图 →' : 'Open the learning map →'}</InternalLink>
      </div>
      <div role='status' aria-live='polite'>
        {record?.status === 'missing' && <p>{zh
          ? '当前浏览器此站点未检测到旧记录。这不代表线上站点或其他浏览器中的记录已经丢失；请在原来使用的浏览器和站点地址查看。'
          : 'No old record was detected for this site in this browser. This does not mean records at the live site or in another browser are lost. Check the original browser and site address.'}</p>}
        {record?.status === 'unavailable' && <p>{zh
          ? '浏览器暂不允许读取本机存储，尚未取得旧记录。你可以检查浏览器权限后重试；现有记录没有被修改。'
          : 'Browser storage could not be read. You can check browser permissions and retry. Existing records have not been changed.'}</p>}
        {record?.status === 'available' && <>
          {record.summary && <p>{zh ? '旧记录概况：' : 'Record summary: '}
            {record.summary.role === 'senior' ? (zh ? '中高级销售' : 'Senior seller')
              : record.summary.role === 'manager' ? (zh ? '销售管理者' : 'Sales manager')
                : (zh ? '角色未识别' : 'Unrecognized role')}
            {' · '}{record.summary.plan ? `${record.summary.plan}${zh ? ' 天计划' : '-day plan'}`
              : (zh ? '计划未识别' : 'Unrecognized plan')}
            {' · '}{record.summary.checkedEntries === null ? (zh ? '勾选记录未识别' : 'Unrecognized checklist')
              : (zh ? `记录中有 ${record.summary.checkedEntries} 项勾选` : `${record.summary.checkedEntries} checked entries`)}
          </p>}
          <p>{record.format === 'text'
            ? (zh ? '记录不是有效 JSON，无法解析概况，但原始文本仍可导出；不会清除或修复原记录。' : 'The record is not valid JSON. Its original text can still be exported without clearing or repairing it.')
            : (zh ? '导出保留原始字段和格式，不作筛选或转换。文件只下载到本机，不会上传。' : 'Export preserves the original fields and formatting. The file is downloaded locally and is not uploaded.')}</p>
        </>}
        {downloadState === 'started' && <p>{zh ? '已发起下载，请在浏览器下载列表中核对文件。' : 'Download requested. Check the file in your browser downloads.'}</p>}
        {downloadState === 'error' && <p>{zh ? '下载未能发起，请重试。旧记录没有被修改。' : 'The download could not start. Please retry; the record has not been changed.'}</p>}
      </div>
    </section>
  );
}

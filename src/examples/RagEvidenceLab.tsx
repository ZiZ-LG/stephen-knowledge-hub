import { useState } from 'react';
import { explainRagConditions, initialRagConditions, type RagTeachingConditions } from './ragTeachingModel';

export default function RagEvidenceLab() {
  const [conditions, setConditions] = useState(initialRagConditions);
  const result = explainRagConditions(conditions);
  const update = <K extends keyof RagTeachingConditions>(key: K, value: RagTeachingConditions[K]) =>
    setConditions((current) => ({ ...current, [key]: value }));

  return (
    <div className='evidence-lab'>
      <div className='lab-heading'>
        <div><p className='section-index'>改变条件，看回答为什么要变化</p><h3>“客户甲的设备坏了，可以免费换新吗？”</h3></div>
        <button type='button' onClick={() => setConditions(initialRagConditions)}>重置条件</button>
      </div>
      <p className='lab-disclaimer'>虚构教学演示 · 结果来自下面明确的规则，不调用 AI、不连接客户系统，也不实际转接人工。身份切换仅用于教学，不能用作真实系统的授权方式。</p>
      <p>人工状态单独演示：预设用户已提出人工核查请求。是否有人接单，不改变资料是否充分，也不代表申请获批。</p>
      <div className='lab-layout'>
        <fieldset className='lab-controls'>
          <legend>先改一个条件</legend>
          <label htmlFor='lab-role'>查询角色</label>
          <select id='lab-role' value={conditions.role} onChange={(event) => update('role', event.target.value as RagTeachingConditions['role'])}>
            <option value='account_owner'>客户甲的客户经理</option>
            <option value='other_seller'>其他客户的客户经理</option>
            <option value='service_engineer'>售后工程师</option>
          </select>
          <label htmlFor='lab-documents'>资料准备情况</label>
          <select id='lab-documents' value={conditions.documents} onChange={(event) => update('documents', event.target.value as RagTeachingConditions['documents'])}>
            <option value='current'>规程和适用条款均为现行版本</option>
            <option value='missing'>只有通用规程，适用条款缺失</option>
            <option value='outdated'>目前只有旧版规程</option>
          </select>
          <label className='lab-checkbox'><input type='checkbox' checked={conditions.detailsKnown} onChange={(event) => update('detailsKnown', event.target.checked)} />设备型号与故障信息已补齐</label>
          <label className='lab-checkbox'><input type='checkbox' checked={conditions.humanAvailable} onChange={(event) => update('humanAvailable', event.target.checked)} />模拟人工确认接单</label>
          <details><summary>查看简化假设</summary><p>本例仅客户甲的客户经理可查本次客户条款；另外两种角色只查通用规程。资料和输入齐全仅支持提出申请，最终必须由负责人批准。规则由编辑设置，真实项目需按岗位、资料和审批流程另行定义。</p></details>
        </fieldset>
        <div className='lab-results' aria-live='polite' aria-atomic='true'>
          <div className='lab-document-list'><p className='section-index'>本轮可用依据</p><ul>{result.documents.map((document) => <li key={document}>{document}</li>)}</ul></div>
          <div className='lab-answer'><span className='lab-status'>回答边界</span><h3>{result.heading}</h3><p>{result.answer}</p><p className='lab-reason'><strong>为什么：</strong>{result.reason}</p></div>
          <div className='lab-handoff'><strong>{result.handoff}</strong><p>{result.handoffReason}</p></div>
        </div>
      </div>
      <p className='lab-observation'>每次先重置，再单独试一个条件：更换角色、只留旧版规程、去掉故障信息，或模拟人工接单。观察“依据、回答、后续状态”哪一项变了。若同时缺少多项条件，本例先检查版本，再检查业务输入，最后检查适用依据。</p>
    </div>
  );
}

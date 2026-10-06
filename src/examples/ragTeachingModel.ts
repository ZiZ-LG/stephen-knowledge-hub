export interface RagTeachingConditions {
  readonly role: 'account_owner' | 'other_seller' | 'service_engineer';
  readonly documents: 'current' | 'missing' | 'outdated';
  readonly detailsKnown: boolean;
  readonly humanAvailable: boolean;
}

export const initialRagConditions: RagTeachingConditions = {
  role: 'account_owner', documents: 'current', detailsKnown: true, humanAvailable: false,
};

/** Deterministic teaching rules, not retrieval, authorization, model inference or a live handoff. */
export function explainRagConditions(input: RagTeachingConditions) {
  const canUseCustomerTerms = input.role === 'account_owner' && input.documents === 'current';
  const documents = input.documents === 'outdated'
    ? ['旧版售后规程：有效性待核实，不能支持本次权益判断']
    : ['现行通用售后规程：可供该角色查询'];
  if (canUseCustomerTerms) documents.push('客户甲条款：可用于本次申请条件核对');

  let decision: 'clarify' | 'verify_version' | 'missing_evidence' | 'approval';
  let heading: string;
  let reason: string;
  let answer: string;
  if (input.documents === 'outdated') {
    decision = 'verify_version';
    heading = '先核对有效版本';
    reason = '检索到相似内容，不代表内容仍然有效。示例规则要求先取得当前适用版本。';
    answer = '现有材料不足以判断本次权益。请先核对适用规程，再继续处理；不能引用旧规则作出承诺。';
  } else if (!input.detailsKnown) {
    decision = 'clarify';
    heading = '先追问设备与故障情况';
    reason = '缺少型号和故障信息，无法判断条款是否适用。多生成几段话不会补齐业务输入。';
    answer = '请补充设备型号、故障表现和受理信息。资料可查不等于已经满足申请条件。';
  } else if (!canUseCustomerTerms) {
    decision = 'missing_evidence';
    heading = '只说明通用流程，具体权益待核对';
    reason = '当前可用资料不足以支持客户甲的具体权益判断。未查到不能被解释为权益不存在。';
    answer = '可先登记问题，并请获授权的负责人核对适用依据。当前不能确认能否免费换新。';
  } else {
    decision = 'approval';
    heading = '可以整理申请依据，仍需负责人批准';
    reason = '这个虚构案例规定：资料支持提出申请，负责人决定是否换新。检索和生成回答不会赋予批准权。';
    answer = '现有资料可支持进一步核验申请条件。我可以整理依据和待确认项，但不能替负责人向客户作出换新承诺。';
  }
  return {
    decision, heading, reason, answer, documents,
    handoff: input.humanAvailable ? '模拟：人工已接手，仍待决定' : '模拟：已请求转接，等待接单',
    handoffReason: input.humanAvailable
      ? '在这个条件分支中，人工确认接单；这仍不等于批准换新或问题已解决。'
      : '本演示预设用户已请求人工核查；没有人工确认接单时，只能记录待处理状态，并告知后续联系渠道。',
  };
}

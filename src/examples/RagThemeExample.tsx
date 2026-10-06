import ThemeExplainer from '../components/ThemeExplainer';
import InternalLink from '../components/InternalLink';
import RagEvidenceLab from './RagEvidenceLab';

const sources = [
  { id: 'E1', title: 'RAG 原论文', url: 'https://arxiv.org/abs/2005.11401', date: '2020-05-22 首次提交；2021-04-12 修订', boundary: '支持检索与生成结合的原理。论文实验不能直接证明企业落地收益。' },
  { id: 'E2', title: 'Azure AI Search：文档级权限', url: 'https://learn.microsoft.com/en-us/azure/search/search-document-level-access-overview', date: '2026-09-17 文档更新', boundary: '说明按身份过滤和权限同步条件。部分原生权限集成功能仍属预览，需按具体方式核对。' },
  { id: 'E3', title: 'Copilot Studio：生成回答 FAQ', url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/faqs-generative-answers', date: '2026-05-30 文档更新', boundary: '承认生成错误及来源不做准确性检查的限制。有引用不等于已核实。' },
  { id: 'E4', title: 'Copilot Studio：转接人工', url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-hand-off', date: '2026-08-03 文档更新', boundary: '真实接管需要客服平台集成。演示触发不能证明人工已接单或问题已解决。' },
] as const;

function Ref({ id }: { readonly id: typeof sources[number]['id'] }) {
  const source = sources.find((entry) => entry.id === id)!;
  return <a className='inline-evidence' href={source.url} target='_blank' rel='noopener noreferrer' aria-label={`来源 ${id}：${source.title}`}>[{id}]</a>;
}

export default function RagThemeExample() {
  return (
    <>
      <aside className='review-warning'><strong>教学场景</strong><p>本篇将研究原理与产品文档合在一个虚构售后问题中解释，不代表今天发生了一次产品发布。</p></aside>
      <ThemeExplainer
        title='企业知识库能帮你找依据，但不能替你承诺免费换新'
        summary='面对同一个售后问题，身份、资料版本和审批责任不同，AI 应给出的回答也不同。理解这些条件，比只看回答是否流畅更能帮助销售判断项目范围。'
        asOfDate='2026-10-05'
        context='通用企业售后场景。行业背景待补充：你的客户销售什么产品、适用哪类规程、谁能批准例外、错误承诺会造成什么后果。'
        sections={[
          { id: 'what-changed', title: '从会回答，到能接入业务', content: <>
            <p>本期把一个研究原理与三份产品文档合起来看：2020 年的检索增强生成（RAG，即先找资料再组织回答）论文，将外部资料检索与回答生成结合；现行产品文档进一步说明了查询权限、生成限制和人工接管条件。文档更新日期分别列在文末，不能当成产品首次上线日期。<Ref id='E1' /><Ref id='E2' /><Ref id='E3' /><Ref id='E4' /></p>
            <p><strong>我们的判断：</strong>销售评估知识库项目时，问题应从“它能答出什么”推进到“谁能用什么依据回答，答不了之后谁负责”。这是一种项目判断方法，不是已证实的行业普遍收益。</p>
          </> },
          { id: 'how-it-works', title: '先找资料，再组织回答', content: <>
            <p><strong>检索增强生成（RAG）</strong>，可以理解为先从资料中找依据，再把问题和相关片段交给语言模型组织回答。语言模型负责生成语言；企业资料没有因此自动变成模型永久学会的知识。<Ref id='E1' /></p>
            <p>以前，客户经理自己翻规程、找合同、问售后。现在，系统可以承担部分查找和整理。但查找范围、资料版本和审批责任仍需设计。Azure 文档说明了按身份筛选资料的机制；权限信息是否及时同步也是实施条件。<Ref id='E2' /></p>
            <ol className='theme-flow' aria-label='知识库问答的教学流程'>
              <li><strong>问题与身份</strong><span>先知道谁在问什么</span></li>
              <li><strong>可用资料</strong><span>按权限查找相关内容</span></li>
              <li><strong>检查条件</strong><span>核对版本、缺口与审批</span></li>
              <li><strong>回答或追问</strong><span>用依据限定回答范围</span></li>
              <li><strong>交接与记录</strong><span>谁接手，停在哪一步</span></li>
            </ol>
            <p className='theme-caption'>箭头表示处理顺序。版本核对、停止条件和审批是示例中的业务规则，不是 RAG 自动提供的可靠判真能力。</p>
            <details className='theme-reading-more'><summary>再深一层：检索为什么也会找错？</summary><p>系统通常先把资料拆成较小片段，再通过关键词或语义接近程度找候选。语义接近只表示内容可能相关，不能证明它当前有效、适用于这个客户，或足以支持整段回答。还要验证版本、权限和引用是否支撑结论。生成回答文档也明确提醒：来源有错时，回答可能把错误带给用户。<Ref id='E3' /></p></details>
          </> },
          { id: 'business-example', title: '把条件放进一个售后问题', content: <>
            <p><strong>虚构示例：</strong>客户甲反馈设备故障，客户经理想知道能否免费换新。输入包括客户身份、型号、故障说明和获准使用的售后资料。AI 整理规则与待补信息；售后核实故障，合同负责人确认权益，审批人决定承诺。输出应进入带依据的处理单，不直接成为对客户的保证。</p>
            <p>下面的演示不比较模型强弱。它只改变几个业务条件，展示为何同一个问题有时应回答、有时应追问、有时必须暂停。</p>
            <RagEvidenceLab />
          </> },
          { id: 'customer-meaning', title: '销售该问什么，才能判断价值', content: <>
            <p>如果团队花很多时间找同一类资料，检索与摘要可能减少查找工作；若主要困难是资料冲突、责任不清或审批排队，只增加对话框未必缩短处理周期。这里的效率与质量影响是有条件的分析，需要用客户实际流程验证。</p>
            <div className='theme-table-wrap'><table className='theme-table'><caption>同一个“知识库需求”，可能对应不同交付范围</caption><thead><tr><th>客户真正卡在哪里</th><th>优先了解什么</th><th>可能需要交付什么</th></tr></thead><tbody>
              <tr><td>资料找不到</td><td>资料在哪，谁维护，能否按权限检索</td><td>资料整理、连接与检索</td></tr>
              <tr><td>找到后仍不知道是否适用</td><td>规则条件、版本和例外怎样判断</td><td>条件说明、证据展示和人工核对</td></tr>
              <tr><td>知道答案却办不下去</td><td>谁批准，怎样建单，谁确认接管</td><td>流程连接、责任分配和处理状态</td></tr>
            </tbody></table></div>
            <p>这会影响采购参与者：业务负责人定义成功，资料负责人保证内容，信息技术（IT）团队配置连接和权限，主管安排接管。销售应先确认这些分工，再讨论软件功能与范围。是否需要这些角色，应按具体客户组织核实。</p>
          </> },
          { id: 'conditions', title: '演示、部署、收益，分三步判断', content: <>
            <p><strong>能力演示：</strong>能对一组准备好的问题回答。<strong>实际部署：</strong>还要验证真实身份、授权资料、连接稳定性、更新责任和人工通道。<strong>业务收益：</strong>再看真实使用下的问题解决、返工、错误承诺和总投入，不能把“生成一段答案”统计成成功解决。</p>
            <p>Copilot Studio 的官方 FAQ 明确承认回答可能出错，而且不对来源做准确性检查。转人工也需要真实客服系统连接；有转接节点并不代表有人接单。<Ref id='E3' /><Ref id='E4' /></p>
            <p>因此，验证样本应包含无答案、越权、旧版本、资料冲突和需要审批的情况。由业务人员定义可接受结果，再与系统记录对账。本示范没有企业部署证据或收益数据，所以不提供准确率、节省小时或投资回报数字。</p>
          </> },
        ]}
        takeaway='能找到依据、能解释规则、能批准办理，是三种不同能力。'
        question='自测：系统引用了一份售后规程，回答很流畅，还显示“已请求转人工”。你能据此告诉客户“可以免费换新，售后已经在处理”吗？'
        answer={<p>还不能。先确认规程是现行版本、适用于该客户和本次故障，并核实谁有权批准换新。“已请求转人工”仅说明发出了请求，还需要接单确认；即使已接单，也不等于已批准或已解决。引用、审批和接管各需自己的证据。</p>}
        history={<>
          <p>本次新增的是“权限—资料—回答—审批—接管”的完整场景和条件实验。它扩展下面的既有主题，没有宣称修正其事实，也没有将旧稿重新包装成新消息。当前历史集合未找到独立的 RAG 概念条目。</p>
          <ul><li><InternalLink href='/items/customer-task-evaluation-over-benchmarks/'>客户任务评测（ST-005）</InternalLink>：把测试落到真实问题。</li><li><InternalLink href='/items/enterprise-agent-control-plane/'>身份与权限治理（ST-006）</InternalLink>：把可用资料与角色联系起来。</li><li><InternalLink href='/items/agent-evaluation-failure-recovery-cost/'>失败、恢复与成本（ST-009）</InternalLink>：失败后怎样继续办理。</li></ul>
        </>}
        sources={<>
          <p>核对日期：2026-10-05。E1 是研究论文；E2–E4 是厂商官方机制与限制文档，均不构成本示范的企业部署或收益证明。</p>
          <ol className='theme-source-list'>{sources.map((source) => <li key={source.id}><a href={source.url} target='_blank' rel='noopener noreferrer'><strong>{source.id} · {source.title}</strong></a><p>{source.date}。{source.boundary}</p></li>)}</ol>
        </>}
      />
    </>
  );
}

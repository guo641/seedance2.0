/**
 * Seedance 2.0 提示词反推 —— 系统提示词与各类改写指令。
 *
 * 核心思想:给视觉模型「关键帧序列 + 台词/字幕」,让它反向推理出一份
 * 可直接回喂给 Seedance 2.0 重新生成该视频的分镜提示词。
 *
 * 输出铁律(与原程序一致):
 *  - 每段时长严格 ≤ 12 秒(最后一段按实际剩余)
 *  - 每段字段结构固定、纯文本、分号分隔、段间用分隔符
 */

export const SEGMENT_SECONDS = Number(process.env.SEGMENT_SECONDS || 12);

/**
 * 分镜输出格式说明(所有反推 / 改写都复用同一格式,保证可解析)。
 * seg = 每段最大秒数,由调用方传入(前端"分段时长"),不再写死。
 */
export function storyboardFormat(seg: number = SEGMENT_SECONDS): string {
  return `
【输出格式 — 严格遵守,不要输出任何多余解释】
按时间顺序分段。段与段之间用单独一行 "----" 分隔。
每一段内部,【每个字段各自单独占一行】,字段标签后跟中文冒号,顺序固定如下(不要把多个字段挤在同一行、不要用分号连成一坨):

第N段
时间：mm:ss-mm:ss
场景：<地点+室内外+时间(白天/夜)+光影(自然光/逆光/顶光/霓虹)+色调+氛围>
角色：
· <称谓>：<估计年龄+性别+脸型五官肤色+发型发色+上衣(具体颜色+款式)+下装(具体颜色+款式)+配饰/妆容>
· <称谓>：<...>（每个人物单独一行,以"· "开头;无人物则本字段写 无)
时间线：
[0-3s] <人物称谓> <具体动作:表情+肢体+走位+与谁互动+镜头变化>（若此刻说话)说:「台词原文」
[3-6s] <...>（每一拍单独占一行,以"[相对秒]"开头,一拍一行,时间连续覆盖整段)
镜头：<景别(大特写/特写/近景/中景/全景/远景)+机位(平视/俯/仰/过肩/第一人称)+运镜(固定/推/拉/摇/移/跟/环绕/手持)+景深>
台词：<本段所有台词按顺序汇总,每句 角色名:「内容」,多句之间用 / ;无则写 无>
配音：<各说话人语气/情绪/音色/语速>
音效：<只写环境声/场景音 + 动作特效音(如脚步声、关门声、雨声、玻璃碎裂声等);【不要写背景音乐/BGM/配乐】。无则写 无>

【铁律】
1. 【排版】每个字段必须独立成行,角色每人一行(以"· "开头)、时间线每拍一行(以"[相对秒]"开头);绝不允许把整段字段用分号挤成一行。
2. 每段时长【尽量贴近 ${seg} 秒】(不是上限,别主动切更短),"时间"字段起止差约等于 ${seg} 秒,只有最后一段可更短;总段数 ≈ 视频总时长 ÷ ${seg}(向上取整)。
3. 【时间线精确到秒】把整段拆成 2-4 秒一节的连续小节,写清"这几秒谁做了什么、(若说话)说了哪句";严禁把多动作多台词堆成一句;每个动作/每句台词落到它发生的那一节,时间连续不跳空、累计等于本段时长。
4. 【台词归属】每句台词挂在发生的小节并注明说话人,原文照搬不改不漏;说话人依据"该时刻谁在张嘴/镜头对准谁"+对话轮替判断,对话通常交替,别把连续多句归给同一人。
5. 【人物精准】角色字段像设定卡:必须有年龄/性别/长相/发型/【衣服具体颜色和款式】(如"藏青色短袖T恤",不能只写"黑衣")/配饰;同一人各段外貌一致。
6. 【动作具体】禁止"两人对话""站着"这类空泛词,要写清姿态/方向/互动,达到 Seedance 2.0 标准。
7. 只输出分镜正文,不要前言、总结、markdown 代码块。
`.trim();
}

/** 兼容旧引用:默认段长的格式串 */
export const STORYBOARD_FORMAT = storyboardFormat(SEGMENT_SECONDS);

/** 输出风格说明块(反推 / 解说反推共用)。 */
export function styleBlock(style?: string): string {
  const s = (style || '').trim();
  if (!s || /原(片|视频)风格|保持原样|默认/.test(s))
    return `\n【输出风格】忠实还原真实风格,不做风格化改写。`;
  return `
【输出风格 = ${s}】(最高优先级的视觉呈现要求,必须【深度渗透】到每一段,不能只在场景里贴一个"${s}风格"标签了事)
- 角色字段:年龄、性别、服装的具体颜色与款式、发型 等【客观信息保持不变】;但人物的【面部渲染方式、五官画法、皮肤与头发质感、上色方式、线条、轮廓描边、光影塑造】必须改写成【${s}】的画风用词。例如:2D动画→赛璐璐平涂、动漫式大眼、清晰描边;3D动画→皮克斯式立体建模、次表面散射皮肤;赛博朋克→霓虹反光、金属义体质感、冷蓝紫调;复古胶片→颗粒感、暖调褪色、柔焦;国风古风→水墨晕染、工笔线条。
- 画面/场景/镜头字段:整体色调、光影、材质、笔触、环境渲染都要贴合【${s}】。
- 【绝不能改的】:人物年龄性别、动作走位、台词原文、剧情走向——只改"用什么画风呈现",不改"画的是什么"。
- 让描述的【用词本身】就是【${s}】风格,而不是在写实描述后面加一句"${s}风格"。`;
}

/** 反推主系统提示词(视觉模型)。seg = 每段最大秒数;style = 输出画面风格。 */
export function reverseSystemPrompt(seg: number = SEGMENT_SECONDS, style?: string): string {
  return `你是 Seedance 2.0 视频生成模型的「逆向提示词工程师」,精通 Seedance 2.0 文生视频提示词写法(主体+主体动作+场景+镜头语言+光影氛围+风格)。用户会给你一段视频抽取的按时间排序的关键帧,以及该视频音轨转写的台词。
你的任务:反向推理出一份专业、详尽的分镜提示词,使其交给 Seedance 2.0 后能重新生成一段与原视频高度一致的视频。
像资深分镜师+提示词工程师一样,把每个镜头的主体外貌与动作、场景光影、构图景别、机位与运镜、配音语气、音乐音效都写具体、写细。${styleBlock(style)}
${storyboardFormat(seg)}`;
}

/** 输出风格预设(前端下拉;可自定义) */
export const STYLE_PRESETS: { id: string; label: string }[] = [
  { id: '', label: '原片风格(忠实还原)' },
  { id: '电影感', label: '电影感 / 电影质感大片' },
  { id: '写实纪实', label: '写实纪实 / 纪录片' },
  { id: '2D动画', label: '2D 动画 / 二次元' },
  { id: '3D动画', label: '3D 动画 / 皮克斯风' },
  { id: '国风古风', label: '国风古风 / 水墨' },
  { id: '赛博朋克', label: '赛博朋克 / 霓虹未来' },
  { id: '复古胶片', label: '复古胶片 / 港风' },
  { id: '唯美清新', label: '唯美清新 / 日系小清新' },
  { id: '广告大片', label: '广告大片 / 商业质感' },
];

/** 反推用户提示词 */
export function reverseUserPrompt(opts: {
  subtitle?: string;
  subtitleTimed?: boolean; // 字幕是否含时间戳(SRT)
  subtitleOcr?: boolean; // 无 ASR,靠读画面字幕
  frameCount: number;
  frameTimestamps?: number[]; // 每帧对应的秒数
  dialogueAligned?: boolean; // 是否有帧对准了台词时刻
  segmentSeconds: number;
  durationSec?: number;
  extra?: string;
}): string {
  const parts: string[] = [];
  // 帧 + 时间戳:让模型能把台词对齐到具体时刻的画面
  if (opts.frameTimestamps && opts.frameTimestamps.length) {
    const list = opts.frameTimestamps.map((t, i) => `第${i + 1}帧@${t}s`).join('、');
    const alignNote = opts.dialogueAligned
      ? '其中一部分帧是【专门在每句台词发生的时刻抽取的】,所以某句台词的时间点,基本都能在对应秒数的帧里看到"正在说话的那个人"(嘴型/表情/镜头对象)。请据此判断说话人,几乎不用猜。'
      : '';
    parts.push(
      `以下按时间顺序给出 ${opts.frameCount} 张关键帧,每张对应视频中的秒数如下:${list}。${alignNote}请把台词按时间戳与画面帧对齐:某句台词发生在某秒,就看那一秒附近的帧里【谁在张嘴/是说话主体】,据此归属说话人。`,
    );
  } else {
    parts.push(
      `以下是从视频中等间隔抽取的 ${opts.frameCount} 张关键帧(按时间先后排列)。请结合画面逐帧理解镜头的变化。`,
    );
  }
  if (opts.durationSec) {
    const total = Math.round(opts.durationSec);
    const n = Math.max(1, Math.ceil(total / opts.segmentSeconds));
    // 预先算好每段的精确起止时间,杜绝段长漂移(如把 15 秒切成 14 秒)
    const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const bounds = Array.from({ length: n }, (_, i) => {
      const st = i * opts.segmentSeconds;
      const en = Math.min(total, (i + 1) * opts.segmentSeconds);
      return `第${i + 1}段 ${mmss(st)}-${mmss(en)}`;
    }).join('、');
    parts.push(
      `视频总时长约 ${total} 秒。必须切成【正好 ${n} 段】,每段的"时间"字段必须严格用下列精确起止(不得改成 14 秒等其它段长):${bounds}。`,
    );
  } else {
    parts.push(`请按【每段贴近 ${opts.segmentSeconds} 秒】分段(目标段长,不要切得更短)。`);
  }
  if (opts.subtitle && opts.subtitle.trim()) {
    const timedNote = opts.subtitleTimed
      ? '(SRT 格式,每句都带【起止时间戳】)'
      : '(纯文本,无时间戳,请按句子先后顺序推断时间)';
    parts.push(
      `\n【视频音轨转写的台词/字幕 ${timedNote},务必据此逐句还原台词字段,原文照搬不改写】\n${opts.subtitle.trim()}`,
    );
    parts.push(
      `\n【说话人归属 — 极其重要,请严格按步骤做】
1. 先通读所有关键帧,识别出片中出现的【每一个不同人物】,按外貌(性别/年龄/发型/服装颜色)给每人一个稳定称谓(如"红衣女""蓝衣男"),全片保持一致。
2. 对每一句台词:先看它的时间戳(或先后顺序),定位到最接近该时刻的关键帧,观察【那一帧/前后帧里谁的嘴在动、镜头对准谁、谁是当前说话主体】,把台词归给这个人。
3. 若某句从画面实在看不出说话人,再用对话逻辑辅助判断:称呼(如"老婆""妈")、你问我答的轮替关系、上下句语义——A 问的问题应由 B 回答,不要把一个人的话全堆给同一个人。
4. 对话通常是【交替进行】的,警惕把连续几句都归给同一个人;如果发现 A、B 轮流说话,请确保归属也是交替的。
5. 台词内容原文照搬、一字不改、不遗漏;区分【台词】(人物开口)与【解说】(画外旁白)。`,
    );
  } else if (opts.subtitleOcr) {
    parts.push(
      `\n【台词来源 = 画面字幕 OCR】本视频的语音转写不可用,但抖音视频画面上通常有【烧录的字幕条】(多在画面中下部)。请你【逐帧仔细读取画面里的字幕文字】,把它们按出现顺序、原文照抄地作为台词填入各段——这是真实台词,不要自己臆造、不要漏读。多张相邻帧字幕相同的算同一句。结合"此刻镜头对准谁/谁在张嘴"判断说话人,对话通常交替。若某帧确实没有任何字幕且看不出有人说话,该处台词才写"无"。`,
    );
  } else {
    parts.push(`\n本视频未能转写到台词,请仔细读取画面里的字幕条并原文照抄作为台词;若画面也无字幕,则据口型推断,实在无法判断才写"无"。`);
  }
  if (opts.extra) parts.push(`\n${opts.extra}`);
  parts.push(`\n现在开始输出分镜提示词。`);
  return parts.join('\n');
}

/** 纯字幕反推(非 vision 模型 fallback) */
export function reverseFromSubtitleUserPrompt(subtitle: string, segmentSeconds: number): string {
  return `以下是一段视频的完整字幕/台词与文案。请据此反推出可回喂 Seedance 2.0 的分镜提示词,画面/镜头/场景由你根据台词与常识合理推断。请以每段不超过 ${segmentSeconds} 秒分段。

【字幕/文案】
${subtitle.trim()}

现在开始输出分镜提示词。`;
}

// ─────────────────────────────────────────────────────────────
// 电影解说文案 → 画面提示词(纯文本反推,不依赖视频/ASR)
// ─────────────────────────────────────────────────────────────

/** 电影解说 → 画面提示词 的输出格式(先锁人物设定,再外层分段+段内动态画面;只要 时间/画面/音效)。 */
export function commentaryFormat(seg: number): string {
  return `
【输出格式 — 严格遵守,不要输出多余解释】
先输出一个【统一设定】块,把所有反复出现的【人物、场景、道具】的固定外观定死,再输出各段。统一设定块、各段之间都用单独一行 "----" 分隔。

统一设定
人物：
· 称谓：物种或年龄+性别 + 脸型五官肤色 + 发型发色 + 上衣(具体颜色+款式) + 下装(具体颜色+款式) + 配饰/特征
· 称谓：...（每个出场人物一行,把服装颜色款式、发型、年龄写死）
场景：
· 场景名：地点+室内外+关键布景陈设+光影色调+氛围（反复出现的地点写在这里,后面同一地点必须一致）
· 场景名：...（若只有一个场景就写一条）
道具：
· 道具名：外观颜色+材质+形状+显著特征（关键道具写这里,后面同一道具必须一致;无关键道具可写 无）
----
第N段
时间：mm:ss-mm:ss
画面：
[段内相对秒 如 0-3s] 一个自足的画面:场景(与【统一设定·场景】一致) + 光影风格 + 出现的人物(外貌与【统一设定·人物】一致) + 关键道具(与【统一设定·道具】一致) + 人物具体动作表情 + 景别/机位/运镜
[3-7s] 下一个画面
（本段内切几个画面由这段解说内容动态决定;每个画面单独一行、以[相对秒]开头,相对时间连续、累计等于本段时长)
音效：只写环境声/场景音 + 动作特效音(如脚步声、关门声、雨声、玻璃碎裂声等);【不要写背景音乐/BGM/配乐】。无则写 无

注意:字段说明里的尖括号只是示意,你实际输出【不要带尖括号】,直接写内容。`;
}

/** 段内画面数下限(每 10 秒至少 4 个,按段长比例,不封顶)。 */
function minBeatsPerSeg(seg: number): number {
  return Math.max(3, Math.round((seg * 4) / 10));
}

/** 电影解说反推系统提示词(外层分段 + 段内动态画面,精简字段)。 */
export function commentarySystemPrompt(seg: number = SEGMENT_SECONDS, style?: string): string {
  const minB = minBeatsPerSeg(seg);
  return `你是「电影解说 → 分镜画面」的资深提示词工程师,既懂电影解说的创作逻辑,又精通 Seedance 2.0 文生视频提示词。
【电影解说逻辑】解说是第三人称旁白,沿"核心冲突链"推进(开头钩子→转折→高潮),节奏快、只讲主线;人物常用泛称(小帅=男主、小美=女主、大壮),沿用文案称谓。
【你的任务】把解说文案按 ${seg} 秒一段分成若干段;在【每一段内部】,再根据这段解说的内容【动态地】切成多个画面镜头——你要理解文案:一句话可以是一个画面,连贯的两三句也可以合成一个画面。每 ${seg} 秒的段内【至少 ${minB} 个画面,上不封顶】,内容密集时可以更多(${minB + 1}、${minB + 2} 个甚至更多),画面数完全由这段解说的叙事节拍决定,【绝不要机械固定每画面时长、也不要低于 ${minB} 个】。
- 每个画面要具体、可视化、自足(会被单独生成,所以每个画面都要带上人物的关键外貌),开头第一个画面给最有冲击力的钩子。
【一致性铁律 — 最重要】每个画面都会被 Seedance 单独生成,所以同一【人物 / 场景 / 道具】在所有画面里必须长得一模一样:
1. 先在开头【统一设定】里,把每个反复出现的人物(服装颜色款式/发型/年龄)、场景(布景陈设/光影色调)、关键道具(颜色/材质/形状)彻底定死。
2. 之后【每一个画面】里出现同一人物/同一场景/同一道具时,其外观必须与统一设定【严格一致】——同样的服装颜色款式、同样的地点布景、同样的道具外观,一个字都不许改、不许自己重新想象。同一地点在不同画面里不能一会儿是这样一会儿是那样。
3. 只有剧情里明确发生了改变(如换了衣服、换了场景、道具损坏)才可变,并说明变成了什么;否则一律保持不变。
- 只输出 时间/画面/音效(外加开头的统一设定),不要配音、不要旁白/解说文字、不要台词。${styleBlock(style)}
${commentaryFormat(seg)}`;
}

/**
 * 电影解说反推用户提示词。
 * totalSec>0 时用它作为总时长(用户已知);否则按字数估算。
 */
export function commentaryUserPrompt(script: string, seg: number, totalSec?: number): string {
  const cn = (script.match(/[一-鿿]/g) || []).length;
  const est = totalSec && totalSec > 0 ? Math.round(totalSec) : Math.max(seg, Math.round(cn / 5));
  const n = Math.max(1, Math.ceil(est / seg));
  const minB = minBeatsPerSeg(seg);
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const bounds = Array.from({ length: n }, (_, i) => {
    const st = i * seg;
    const en = Math.min(est, (i + 1) * seg);
    return `第${i + 1}段 ${mmss(st)}-${mmss(en)}`;
  }).join('、');
  const durLine =
    totalSec && totalSec > 0
      ? `这条解说视频总时长 ${est} 秒(用户已给定,必须严格按此)。`
      : `这段文案约 ${cn} 字,估算总时长约 ${est} 秒。`;

  return `以下是一段【电影解说文案】。请反推出逐镜头的画面提示词,使得按这些画面用 Seedance 2.0 生成后、配上这段解说就能做成解说视频。

【分段要求】
- ${durLine}外层按 ${seg} 秒一段,【切成正好 ${n} 段】,每段"时间"用下列精确边界:${bounds}。
- 把文案按叙事顺序【均匀分配】到这 ${n} 段(前面的段对应前面的文案),覆盖全文、不漏后半部分。
【段内画面(重点)】
- 在每一段的 ${seg} 秒内,根据这段解说的内容【动态切画面】:一句一个画面、或连贯两三句一个画面。【每段至少 ${minB} 个画面,上不封顶】,内容密就多切几个;每个画面标 [段内相对秒],相对时间连续、累计等于本段时长。不要机械固定每画面3秒、也不要少于 ${minB} 个。
- 只输出 时间/画面/音效,不要配音旁白台词;全部段完整输出不得截断。

【电影解说文案】
${script.trim()}

现在开始输出:先给【统一设定】锁定所有人物/场景/道具,再输出 ${n} 段(段内每段≥${minB}个画面、按内容动态切),每个画面里的人物、场景、道具都必须与统一设定完全一致。`;
}

// ─────────────────────────────────────────────────────────────
// 时长调整预设(缩短 / 增加)—— 对应原程序的 8 个档位
// ─────────────────────────────────────────────────────────────

export type AdjustKey =
  | 'shorten_smart'
  | 'shorten_2_3'
  | 'shorten_1_2'
  | 'shorten_1_3'
  | 'extend_smart'
  | 'extend_1_5'
  | 'extend_2'
  | 'extend_3';

export const ADJUST_LABELS: Record<AdjustKey, string> = {
  shorten_smart: '智能缩短（大模型自行判断,删冗余保精华）',
  shorten_2_3: '缩短至 2/3（删约 1/3 内容）',
  shorten_1_2: '缩短至一半（删约一半内容）',
  shorten_1_3: '缩短至 1/3（仅保留核心剧情）',
  extend_smart: '智能增加（大模型自行判断,丰富细节）',
  extend_1_5: '增加至 1.5 倍（适度扩充）',
  extend_2: '增加至 2 倍（大幅扩充）',
  extend_3: '增加至 3 倍（全面扩充,丰富层次）',
};

function commonRule(seg: number): string {
  return `分段铁律(极其重要):【每段时长必须仍保持 ${seg} 秒/段】,与原分镜完全一致,最后一段不足 ${seg} 秒按实际剩余,绝不要改成 12 秒或其它段长。总时长的增加/减少必须通过【增加或减少段数】来实现,而不是改变单段秒数——例如原片 4 段×${seg}秒,增加到 2 倍就应输出约 8 段×${seg}秒。开头钩子(悬念/冲突/吸睛内容)必须完整保留;结尾诱导(关注/点赞/评论引导)必须完整保留。分镜输出格式(第N段、字段结构、纯文本、分号、分隔符)严格不变,时间字段按新的段数重新连续计算。`;
}

const ADJUST_BODY: Record<AdjustKey, string> = {
  shorten_smart: `本条视频需要缩短时长。请在保持核心思想、整体剧情、叙事逻辑完整不变的前提下,自行判断并删减冗余内容、合并重复镜头,输出精简版分镜。台词和动作描述精炼重写,保留核心信息,剧情主线不断裂;总时长明显低于原片(段数减少)。`,
  shorten_2_3: `本条视频需要缩短至原片时长的约 2/3。请删减约 1/3 的冗余内容和镜头,台词与动作精炼重写,保留核心信息,剧情主线完整不断裂;总时长为原片的 60%-70%(段数约为原来的 2/3)。`,
  shorten_1_2: `本条视频需要缩短至原片时长的约一半。请删减约一半的冗余内容和镜头,只保留核心信息和关键剧情,主线完整不断裂;总时长为原片的 45%-55%(段数约为原来的一半)。`,
  shorten_1_3: `本条视频需要缩短至原片时长的约 1/3。请只保留最核心的剧情主线和关键镜头,删除约 2/3 的冗余内容,台词压缩到极致但保持通顺,剧情主线完整不断裂;总时长为原片的 28%-38%(段数约为原来的 1/3)。`,
  extend_smart: `本条视频需要增加时长。请在保持核心思想、整体剧情、叙事逻辑完整不变的前提下,在关键情节处扩充细节:丰富画面描写、增加合理过渡镜头、细化主体动作及表情、配音台词适当加长。所有台词和动作必须由你合情合理地扩写,符合原片剧情走向、角色性格和逻辑,不得虚构无关剧情,不得重复堆砌;总时长明显长于原片(段数增加)。`,
  extend_1_5: `本条视频需要增加至原片时长的约 1.5 倍。请在关键情节处扩充细节:丰富画面描写、增加合理过渡镜头、细化动作表情、配音台词相应加长,合情合理地扩写,不得虚构无关剧情,不得重复堆砌;总时长为原片的 140%-160%(段数约为原来的 1.5 倍)。`,
  extend_2: `本条视频需要增加至原片时长的约 2 倍。请大幅扩充细节:丰富每个镜头的画面描写、增加合理过渡镜头、细化动作表情、配音台词扩写,合情合理地扩写,不得虚构无关剧情,不得重复堆砌;总时长为原片的 190%-210%(段数约为原来的 2 倍)。`,
  extend_3: `本条视频需要增加至原片时长的约 3 倍。请深度扩充所有细节:每个镜头的画面、动作、表情、环境全面细化,合理拆分长镜头并增加过渡镜头,配音台词扩写,合情合理地扩写,不得虚构无关剧情,不得重复堆砌;总时长为原片的 280%-320%(段数约为原来的 3 倍)。`,
};

/** 构建时长调整指令(seg = 原分镜的每段秒数,新版本沿用) */
export function buildAdjustInstruction(key: AdjustKey, seg: number = SEGMENT_SECONDS): string {
  return `${ADJUST_BODY[key]}${commonRule(seg)}`;
}

/** 兼容旧引用:默认段长的指令表 */
export const ADJUST_INSTRUCTIONS: Record<AdjustKey, string> = Object.fromEntries(
  (Object.keys(ADJUST_BODY) as AdjustKey[]).map((k) => [k, buildAdjustInstruction(k, SEGMENT_SECONDS)]),
) as Record<AdjustKey, string>;

export function adjustSystemPrompt(seg: number = SEGMENT_SECONDS): string {
  return `你是 Seedance 2.0 分镜提示词的改写专家。用户会给你一份现有分镜提示词和一条改写指令,请严格按指令输出改写后的完整分镜提示词。改写时【每段时长必须保持 ${seg} 秒/段】,通过增减段数来改变总时长,不要改变单段秒数。${storyboardFormat(seg)}`;
}

// ─────────────────────────────────────────────────────────────
// 提示词变体洗稿(提示词工坊)
// ─────────────────────────────────────────────────────────────

export type VariantDims = {
  scene?: boolean; // 场景变换
  costume?: boolean; // 人物服装变化
  dialogue?: 'reword' | 'manual' | 'keep'; // 台词改写方式
  dialogueManual?: string; // 手动台词
  camera?: boolean; // 镜头语言变化
  duration?: 'keep' | 'shorten' | 'extend'; // 兼容旧字段(已被 durationRatio 取代)
  durationRatio?: number; // 时长倍率:0.5=精简一半 … 1=不变 … 2=加长2倍
};

export function variantSystemPrompt(seg: number = SEGMENT_SECONDS): string {
  return `你是短视频分镜提示词的改写师,负责在保持内容主旨的前提下生成"防同质化"的变体,使其可回喂 Seedance 2.0 生成新视频。除非改写维度明确要求改变时长,否则【每段时长必须保持 ${seg} 秒/段】,与原分镜一致。${storyboardFormat(seg)}`;
}

export function variantUserPrompt(source: string, dims: VariantDims): string {
  const asks: string[] = [];
  if (dims.scene) asks.push('- 场景变换:更换环境/地点/时间/氛围,但保持剧情逻辑一致。');
  if (dims.costume) asks.push('- 人物服装变化:改变主要角色的服装造型。');
  if (dims.dialogue === 'reword') asks.push('- 台词改写:换个说法、意思不变,防止同质化。');
  if (dims.dialogue === 'keep') asks.push('- 台词保持原样,不做任何修改。');
  if (dims.dialogue === 'manual' && dims.dialogueManual)
    asks.push(`- 台词按以下自定义内容逐句替换(说话人不变):\n${dims.dialogueManual}`);
  if (dims.camera) asks.push('- 镜头语言变化:AI 自动优化机位与运镜。');

  // 时长倍率:优先用 durationRatio(0.5~2),否则回退旧的 keep/shorten/extend
  const ratio =
    typeof dims.durationRatio === 'number' && dims.durationRatio > 0
      ? dims.durationRatio
      : dims.duration === 'shorten'
        ? 0.5
        : dims.duration === 'extend'
          ? 1.5
          : 1;
  // 源分镜段数(用于精确计算目标段数)
  const srcCount =
    (source.match(/第\s*\d+\s*段/g) || []).length ||
    source.split(/\n?\s*-{3,}\s*\n?/).filter((s) => s.trim()).length ||
    1;
  const target = Math.max(1, Math.round(srcCount * ratio));
  if (Math.abs(ratio - 1) < 0.01) {
    asks.push(`- 时长:保持原片时长与段数完全不变(必须仍是 ${srcCount} 段,段长照原分镜)。`);
  } else if (ratio < 1) {
    const pct = Math.round(ratio * 100);
    asks.push(
      `- 时长:精简至原片的约 ${pct}%(倍率 ${ratio}×)。删减冗余内容/镜头,剧情主线完整不断裂;【每段时长仍与原分镜相同】,通过减少段数来缩短——原 ${srcCount} 段,必须输出【正好 ${target} 段】,时间字段连续重排。`,
    );
  } else {
    const pct = Math.round(ratio * 100);
    asks.push(
      `- 时长:加长至原片的约 ${pct}%(倍率 ${ratio}×)。在关键情节合理扩充细节/过渡镜头,不虚构无关剧情、不重复堆砌;【每段时长仍与原分镜相同】,通过增加段数来加长——原 ${srcCount} 段,必须输出【正好 ${target} 段】,时间字段连续重排。`,
    );
  }
  return `以下是原始分镜提示词。请按选定维度生成一个变体:\n\n【原始分镜】\n${source}\n\n【改写维度】\n${asks.join('\n') || '- 轻度改写,保持整体不变。'}\n\n现在输出改写后的完整分镜提示词。`;
}

/** 台词提取 */
export const EXTRACT_DIALOGUE_SYSTEM = `你从分镜提示词/文案中提取所有台词(有人说话的内容)。只输出 JSON 数组,每项 {"segment": 段号或序号, "speaker": "说话人", "line": "台词内容"}。若无台词输出 []。不要输出任何多余文字。`;

/** 元数据(标题/标签/梗概)生成 */
export const STORY_META_SYSTEM = `你为一段视频分镜生成发布元数据。只输出 JSON:{"title":"吸引人的标题(≤20字)","tags":["标签1","标签2","标签3"],"summary":"一句话梗概(≤50字)"}。不要输出多余文字。`;

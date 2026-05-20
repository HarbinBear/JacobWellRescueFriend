// 对话脚本数据结构定义
//
// 每份对话脚本是一个 DialogueScene。脚本数据本身**不写代码逻辑**，只描述数据。
// 由 src/story/DialogueRunner.ts 解释执行。

export type Speaker = 'man' | 'girl' | 'narration' | 'silence';

export type Anchor = 'door' | 'sofa' | 'desk' | 'window' | 'exit' | 'center';

export type SceneAction =
    | { type: 'wait'; ms: number }
    | { type: 'sfx'; name: string }
    | { type: 'move'; who: 'man' | 'girl'; to: Anchor }
    | { type: 'fade'; to: 'black' | 'in'; ms: number }
    | { type: 'addStone' }
    | { type: 'flag'; key: string };

export interface DialogueNode {
    speaker: Speaker;
    text?: string;            // 显示在对话框里的台词；narration 时为细字
    duration?: number;         // 不填=等玩家点击；填了=自动推进时长（毫秒）
    action?: SceneAction;      // 进入该节点同时触发的演出
    kickOut?: boolean;         // 这一节点处给"赶她走"按钮（极少用）
}

export interface DialogueScene {
    id: string;
    nightIndex: number;
    title: string;             // 用于剧情进度选择页
    girlComes: boolean;
    pre?: SceneAction[];       // 对话前演出（敲门声、女孩入场动画）
    nodes: DialogueNode[];
    post?: SceneAction[];      // 对话后演出（女孩离开）
    onComplete?: {
        setFlags?: string[];
        knownNight?: string;   // 加入 state.story2.knownNights
    };
}

// 第 1 晚 · 走丢的小孩
//
// 主线主角第一次完成救援后回到住所，门外来了个找玩具的小女孩。
// 基调：正常的"哪儿来的走丢小孩"，无金句、无玄学、无脚印疑团。
//
// 来源：剧本-01-前期·初遇与日常.md · Day 1

import { DialogueScene } from './types';

export const night_01_arrival: DialogueScene = {
    id: 'night_01_arrival',
    nightIndex: 1,
    title: '第 1 晚 · 走丢的小孩',
    girlComes: true,
    pre: [
        { type: 'sfx', name: 'uiSecondary' }, // 临时：以 UI 音替代敲门声，等正式 knock 音效到位再换
    ],
    nodes: [
        { speaker: 'man',  text: '……谁家小孩？', duration: 2200 },
        { speaker: 'girl', text: '你好。' },
        { speaker: 'man',  text: '你好。这都几点了，你一个人？' },
        { speaker: 'girl', text: '嗯。' },
        { speaker: 'man',  text: '家里大人呢？' },
        { speaker: 'girl', text: '我能进来吗？',
          action: { type: 'move', who: 'girl', to: 'sofa' } },
        { speaker: 'narration', text: '*没等他答应，她已经从他胳膊底下钻了进去。*', duration: 2400 },
        { speaker: 'man',  text: '哎不行——' },
        { speaker: 'narration', text: '*她在屋里转了一小圈，看了看墙上的合影，看了看那台破收音机，最后停在窗台前。*', duration: 3200 },
        { speaker: 'man',  text: '你叫什么？谁让你跑到这山上来的？这附近也没别人住啊。' },
        { speaker: 'girl', text: '我来找一个东西。' },
        { speaker: 'man',  text: '什么东西？' },
        { speaker: 'girl', text: '一个会跳舞的小玩意儿。叫【铛铛】。' },
        { speaker: 'man',  text: '……你的玩具？' },
        { speaker: 'girl', text: '嗯。' },
        { speaker: 'man',  text: '那你怎么会觉得在我这儿？' },
        { speaker: 'girl', text: '我找了好多地方了。这是最后一个地方。' },
        { speaker: 'man',  text: '行了，跟我说说你家在哪儿，我送你回去。' },
        { speaker: 'girl', text: '不用啦。我认识路。',
          action: { type: 'move', who: 'girl', to: 'door' } },
        { speaker: 'man',  text: '那哪行，我跟你一起——' },
        { speaker: 'narration', text: '*她已经一溜烟跑出去了。山道弯过去一截，再追就什么也看不见了。*', duration: 3000 },
        { speaker: 'man',  text: '……这小破孩。', duration: 2000 },
    ],
    post: [
        { type: 'flag', key: 'metGirl' },
    ],
    onComplete: {
        knownNight: 'night_01_arrival',
        setFlags: ['metGirl'],
    },
};

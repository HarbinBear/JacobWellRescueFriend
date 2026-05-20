// 第 4 晚 · 没说话的一晚
//
// 男主今天捞了第一具遗体。回来很沉默。女孩坐在台阶上，没说话。
// 基调：安静共处。少而有力。
//
// 来源：剧本-01-前期·初遇与日常.md · Day 4

import { DialogueScene } from './types';

export const night_04_silent: DialogueScene = {
    id: 'night_04_silent',
    nightIndex: 4,
    title: '第 4 晚 · 没说话的一晚',
    girlComes: true,
    nodes: [
        { speaker: 'narration', text: '*男主在她身边坐下，没说话。点了根烟。*', duration: 3200 },
        { speaker: 'narration', text: '*过了很久。*', duration: 1800 },
        { speaker: 'girl', text: '……不好闻。' },
        { speaker: 'man',  text: '嗯。' },
        { speaker: 'narration', text: '*又过了很久，小声地。*', duration: 2200 },
        { speaker: 'girl', text: '那今天的事，也不好闻吧。' },
        { speaker: 'man',  text: '……你一个小孩，问这些干什么。' },
        { speaker: 'girl', text: '我走啦。',
          action: { type: 'move', who: 'girl', to: 'exit' } },
        { speaker: 'man',  text: '嗯。' },
        { speaker: 'narration', text: '*她走了。他在台阶上坐到烟燃尽。*', duration: 3000 },
    ],
    onComplete: {
        knownNight: 'night_04_silent',
    },
};

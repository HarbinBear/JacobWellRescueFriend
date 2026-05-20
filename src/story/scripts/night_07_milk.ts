// 第 7 晚 · 牛奶喝完了的悲伤
//
// 男主今天去看望失去儿子的人家。他喝着酒，话很少。
// 女孩用她小孩的方式来共情——这就是 G 类（错位悲伤）。
// 这一类的台词最珍贵，是这条线的"质感"所在。
//
// 来源：剧本-01-前期·初遇与日常.md · Day 7

import { DialogueScene } from './types';

export const night_07_milk: DialogueScene = {
    id: 'night_07_milk',
    nightIndex: 7,
    title: '第 7 晚 · 牛奶喝完了的悲伤',
    girlComes: true,
    nodes: [
        { speaker: 'narration', text: '*男主自己倒了点酒。女孩拉了张小凳子，坐过来。*', duration: 3000,
          action: { type: 'move', who: 'girl', to: 'sofa' } },
        { speaker: 'girl', text: '你今天又在喝那个。' },
        { speaker: 'man',  text: '嗯。' },
        { speaker: 'girl', text: '你妈没说你不能喝吗？' },
        { speaker: 'man',  text: '我妈早不在了。' },
        { speaker: 'girl', text: '……哦。' },
        { speaker: 'narration', text: '*沉默几秒。*', duration: 1800 },
        { speaker: 'man',  text: '今天去看了个家里。儿子才十九。在水里没回来。' },
        { speaker: 'man',  text: '他妈一直问我，你说他在水里冷不冷。我说不冷。其实我也不知道冷不冷。' },
        { speaker: 'narration', text: '*女孩认真地听。*', duration: 2200 },
        { speaker: 'man',  text: '……跟你说这些干什么。' },
        { speaker: 'girl', text: '我懂。' },
        { speaker: 'man',  text: '你懂啥。' },
        { speaker: 'girl', text: '我有一次，把我的牛奶打翻了。是我最喜欢的那种。后来再也买不到了。' },
        { speaker: 'man',  text: '……' },
        { speaker: 'girl', text: '那天我哭了好久。' },
        { speaker: 'man',  text: '……嗯。' },
        { speaker: 'girl', text: '所以那个阿姨，肯定也哭了好久。' },
        { speaker: 'man',  text: '……' },
        { speaker: 'girl', text: '你今天有没有跟她说，对不起呀？' },
        { speaker: 'man',  text: '……我说了。' },
        { speaker: 'girl', text: '哦。那就好啦。' },
        { speaker: 'narration', text: '*她从凳子上跳下来，自然地拿起他的酒杯闻了一下，皱了皱眉，又放回去。*', duration: 3400 },
        { speaker: 'girl', text: '这个不好闻。' },
        { speaker: 'man',  text: '嗯。' },
        { speaker: 'girl', text: '我走啦。',
          action: { type: 'move', who: 'girl', to: 'exit' } },
        { speaker: 'narration', text: '*男主把那杯没喝完的酒，倒了。*', duration: 3000 },
    ],
    onComplete: {
        knownNight: 'night_07_milk',
    },
};

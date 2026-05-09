// 撤离玩法对外 API（外部模块只通过这一处 import）
//
// 设计原则：所有撤离玩法的细节封装在 src/extraction/ 内部，
// 外部代码（MazeLogic / Render / input / game.ts）只看到这个文件暴露的最小接口。
//
// 详见 design/extraction/07-engineering-isolation.md §6
//
// 注意：此文件**不是** src/extraction/index.ts，而是与 src/extraction/ 目录平级的扁平入口。
// 原因：微信小游戏的模块加载器对"目录 + index 文件"的解析不可靠（实测会报
// `module 'src/extraction.js' is not defined`），必须把入口做成扁平的 `.ts` 文件。

// =============================================
// 系统级
// =============================================
export { loadExtractionProgress, saveExtractionProgress, clearExtractionSave } from './extraction/core/ExtractionSave';
export {
    getExtractionState,
    ensureExtractionState,
    resetExtractionState,
    getInitialExtractionState,
} from './extraction/core/ExtractionState';

// =============================================
// 经济
// =============================================
export {
    getCoins,
    addCoins,
    spendCoins,
    sellWarehouseItem,
    sellAllWarehouseItems,
    addToWarehouse,
    transferBagToWarehouse,
    computeItemPrice,
    computeWarehouseTotalValue,
    computeBagTotalValue,
    getItemDisplayName,
    rollCondition,
    settleDiveExtraction,
} from './extraction/logic/Economy';

// =============================================
// 背包
// =============================================
export {
    getBagItems,
    getBagOccupiedSlots,
    getBagFreeSlots,
    canFitInBag,
    addToBag,
    dropFromBag,
    clearBag,
    setBagMaxSlots,
} from './extraction/logic/Inventory';

// =============================================
// 拾取（Relic + 丢弃物 统一）
// =============================================
export {
    findNearbyPickupRelic,
    performPickup,
    getRelicPickupLabel,
    findNearbyPickupTarget,
    performPickupTarget,
    performPickupDropped,
    discardBagItemAtPlayer,
    resetPickupForDive,
} from './extraction/logic/ItemPickup';

// 丢弃物
export {
    getDroppedItems,
    resetDroppedItems,
    dropItemAtPlayer,
    findNearbyDroppedItem,
} from './extraction/logic/DroppedItem';

// =============================================
// 装备
// =============================================
export {
    applyLoadoutForDive,
    restoreLoadoutAfterDive,
    equipPermanent,
} from './extraction/logic/Loadout';

// =============================================
// 商店
// =============================================
export {
    refreshShopSlots,
    ensureShopInitialized,
    getRerollCost,
    performShopReroll,
    performShopBuySlot,
    isEquipmentOwned,
    getConsumableCount,
    consumeConsumable,
    addConsumable,
    shopPriceFor,
} from './extraction/logic/Shop';

// =============================================
// 下潜钩子（MazeLogic 唯一接入点）
// =============================================
export {
    onDiveStart as onExtractionDiveStart,
    onDiveEnd as onExtractionDiveEnd,
    getLastSettlement,
    clearLastSettlement,
    ExtractionEnabled,
} from './extraction/logic/ExtractionDive';

// =============================================
// 物品注册（UI 用查表）
// =============================================
export {
    getItemDef,
    getTreasureByRelicKind,
    isEquipment,
    getEquipmentEffects,
    listItemsByCategory,
    CONDITION_NAMES,
    CONDITION_MULTIPLIERS,
} from './extraction/core/ExtractionRegistry';

// =============================================
// UI 模块的"按钮矩形 getter"与"动作执行"导出（input.ts 静态 import 用）
// =============================================
export { getSellAllBtnRect, performSellAll } from './extraction/render/DebriefExtension';

// 商店 UI
export {
    drawShop,
    drawShopEntryBtn,
    isShopOpen,
    openShop,
    closeShop,
    performShopBuy,
    performShopRerollAction,
    openShopSlotDetail,
    getShopEntryBtnRect,
    getShopCloseBtnRect,
    getShopRerollBtnRect,
    getShopBuyBtnRect,
    getShopSlotHitTests,
} from './extraction/render/ShopUI';

// 背包 HUD
export { getInventorySlotHitTests, openBagItemDetail } from './extraction/render/InventoryHUD';

// 物品详情卡
export {
    drawItemDetailCard,
    isDetailCardOpen,
    openDetailCard,
    closeDetailCard,
    getDetailCardData,
    getDetailCardBackdropRect,
    getDetailCardCloseRect,
    getDetailCardActionRect,
    listDetailCardActionIds,
} from './extraction/render/ItemDetailCard';

// 丢弃物世界层渲染
export { drawDroppedItemsWorld } from './extraction/render/DroppedItemRender';

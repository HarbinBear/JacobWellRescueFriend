import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { resetDriveInput } from './DriveMode';
import { getActionWheelCenter } from './InteractionLayout';
import { aimActionGesture, interactionScope, isInteractionPlay, pickActionTarget } from './ActionTargets';
import { beginActionInteraction, cancelInteraction, interactionFeedback } from './Interaction';

export function canUseActionWheel() {
    return isInteractionPlay() && state.fishBump.stunTimer <= 0;
}

export function startActionGesture(touchId: number, x: number, y: number) {
    if (!canUseActionWheel() || state.wheel.open || state.interaction.gesture) return false;
    if (state.interaction.task) { cancelInteraction(true); return true; }
    if (state.interaction.cooldown > 0) { interactionFeedback('动作恢复中', player); return true; }
    const center = getActionWheelCenter();
    state.interaction.gesture = { touchId, x, y, startX: x, startY: y, centerX: center.x, centerY: center.y,
        dragged: false, scope: interactionScope() };
    state.interaction.aim = aimActionGesture(state.interaction.gesture);
    resetDriveInput();
    return true;
}

export function refreshActionAim() {
    const gesture = state.interaction.gesture;
    state.interaction.aim = gesture && canUseActionWheel() ? aimActionGesture(gesture) : null;
}

export function moveActionGesture(touchId: number, x: number, y: number) {
    const gesture = state.interaction.gesture;
    if (!gesture || gesture.touchId !== touchId) return false;
    gesture.x = x;
    gesture.y = y;
    gesture.selectionLost = false;
    gesture.dragged ||= Math.hypot(x - gesture.startX, y - gesture.startY) >= 7;
    refreshActionAim();
    return true;
}

export function finishActionGesture(touchId: number, x: number, y: number, cancelled: boolean) {
    const gesture = state.interaction.gesture;
    if (!gesture || gesture.touchId !== touchId) return null;
    const displaced = Math.hypot(x - gesture.x, y - gesture.y) > 7;
    const centered = gesture.dragged && Math.hypot(x - gesture.centerX, y - gesture.centerY) <= CONFIG.fishInteraction.wheelInnerRadius;
    // Release confirms the last displayed target; missed pointer motion cancels, never retargets.
    const target = displaced || centered ? null : state.interaction.aim?.target;
    const validScope = gesture.scope === interactionScope();
    state.interaction.gesture = null;
    state.interaction.aim = null;
    if (cancelled || !validScope || !canUseActionWheel()) return false;
    if (!target) {
        if (!gesture.dragged) interactionFeedback('按住拖动，预选鱼或绳子', player);
        return false;
    }
    return beginActionInteraction(target);
}

/** Compatibility for old GM callers; the actual touch button always previews first. */
export function triggerQuickAction() {
    return beginActionInteraction(pickActionTarget(player.angle, undefined, true).target);
}

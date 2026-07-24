import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Habit, healthState } from '../types';
import { resolveForm, evoProgress, stageForXp, STAGE_XP, BRANCH_STREAK, lineName, finalId, formIdAt, displayFormId, megaReady, hasMega, MEGA_XP } from '../species';
import { useApp } from '../AppContext';
import { habitStreak } from '../gameLogic';
import { todayStr } from '../date';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import CreatureView from './CreatureView';
import CreatureImage from './CreatureImage';
import ProgressBar from './ProgressBar';
import TypeBadges from './TypeBadges';

interface Props {
  habit: Habit | null;
  visible: boolean;
  onClose: () => void;
}

export default function CreatureDetail({ habit, visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { setMegaPick } = useApp();
  if (!habit) return null;
  const c = habit.creature;
  const form = resolveForm(c);
  const hs = healthState(c.vitality, c.fainted);
  const evo = evoProgress(c.xp);
  const streak = habitStreak(habit, todayStr());
  const stage = stageForXp(c.xp);
  const fId = finalId(c);
  const finalName = lineName(c);
  const finalReached = stage >= 3;
  const speciesHasMega = hasMega(c);
  const isMega = megaReady(c);
  const megaPick = c.megaPick ?? 0;
  const megaRatio = Math.max(0, Math.min(1, (c.xp - STAGE_XP[3]) / (MEGA_XP - STAGE_XP[3])));

  // Chuỗi tiến hoá: trứng + các dạng TRƯỚC dạng cuối, rồi rẽ nhánh (thường / shiny).
  const chain: { stage: number; formId: number | null; name: string }[] = [
    { stage: 0, formId: null, name: 'Trứng' },
  ];
  for (let k = 0; k < c.line.length - 1; k++) {
    chain.push({ stage: k + 1, formId: c.line[k].id, name: c.line[k].name });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
            <View style={styles.hero}>
              <CreatureView creature={c} size={150} particles />
              <Text style={styles.title}>{habit.title}</Text>
              <Text style={[styles.formName, { color: c.color }]}>{form.stage === 0 ? 'Trứng bí ẩn' : form.name}</Text>
              <View style={styles.typeRow}>
                <TypeBadges formId={displayFormId(c)} />
              </View>
              <View style={[styles.pill, { borderColor: hs.color, backgroundColor: hs.color + '22' }]}>
                <Text style={[styles.pillText, { color: hs.color }]}>{hs.face} {hs.label}</Text>
              </View>
            </View>

            <View style={styles.barBlock}>
              <View style={styles.barHead}>
                <Text style={styles.barLabel}>❤️ Thể trạng</Text>
                <Text style={styles.barVal}>{c.vitality}/100</Text>
              </View>
              <ProgressBar ratio={c.vitality / 100} color={hs.color} />
            </View>

            <View style={styles.barBlock}>
              <View style={styles.barHead}>
                <Text style={styles.barLabel}>✨ Tiến hoá</Text>
                <Text style={styles.barVal}>{evo.nextStage === null ? 'Dạng cuối!' : `Còn ${evo.remaining} XP`}</Text>
              </View>
              <ProgressBar ratio={evo.ratio} color={colors.primary} />
            </View>

            {speciesHasMega && finalReached && (
              <View style={styles.barBlock}>
                <View style={styles.barHead}>
                  <Text style={styles.barLabel}>🔮 Mega tiến hoá</Text>
                  <Text style={[styles.barVal, isMega && { color: colors.accent, fontWeight: '800' }]}>
                    {isMega ? 'Đã Mega!' : `Còn ${MEGA_XP - c.xp} XP`}
                  </Text>
                </View>
                <ProgressBar ratio={megaRatio} color={colors.accent} />
              </View>
            )}

            <View style={styles.stats}>
              <Stat icon="🔥" value={`${streak}`} label="chuỗi ngày" />
              <Stat icon="🏆" value={`${c.bestStreak}`} label="kỷ lục" />
              <Stat icon="⭐" value={`${c.xp}`} label="XP" />
            </View>

            <Text style={styles.section}>Cây tiến hoá</Text>
            <View style={styles.tree}>
              {chain.map((node) => (
                <React.Fragment key={node.stage}>
                  <TreeNode
                    formId={node.formId}
                    name={node.name}
                    active={stage === node.stage}
                    passed={stage > node.stage}
                    revealed={stage >= node.stage}
                  />
                  <Text style={styles.arrow}>→</Text>
                </React.Fragment>
              ))}
              <View style={styles.fork}>
                <BranchNode formId={fId} shiny name={`${finalName} ✨`} tag="bền bỉ" tagColor={colors.accent} active={finalReached && c.branch === 'legendary'} dim={finalReached && c.branch !== 'legendary'} revealed={finalReached} />
                <BranchNode formId={fId} shiny={false} name={finalName} tag="thường" tagColor={colors.primarySoft} active={finalReached && c.branch === 'common'} dim={finalReached && c.branch !== 'common'} revealed={finalReached} />
              </View>
            </View>

            {speciesHasMega && (
              <>
                <Text style={styles.section}>
                  🔮 Mega tiến hoá{c.megas!.length > 1 ? ` · ${c.megas!.length} dạng` : ''}
                </Text>
                <View style={styles.megaRow}>
                  {c.megas!.map((m, i) => {
                    const active = isMega && megaPick === i;
                    return (
                      <Pressable
                        key={m.id}
                        disabled={!isMega}
                        onPress={() => setMegaPick(habit.id, i)}
                        style={[styles.megaCard, active && styles.megaCardActive, !isMega && styles.megaCardLocked]}
                      >
                        <View style={styles.megaImgWrap}>
                          {isMega ? <CreatureImage formId={m.id} size={56} /> : <Text style={styles.megaLock}>🔒</Text>}
                        </View>
                        <Text style={[styles.megaName, active && { color: colors.accent }]} numberOfLines={1}>
                          {isMega ? m.name : '???'}
                        </Text>
                        {isMega && c.megas!.length > 1 && (
                          <Text style={[styles.megaTag, { color: active ? colors.accent : colors.textDim }]}>
                            {active ? 'Đang dùng' : 'Chạm để đổi'}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                {!isMega && (
                  <Text style={styles.hint}>
                    Nuôi tới {MEGA_XP} XP (mục tiêu dài hạn) để mở khoá
                    {c.megas!.length > 1 ? ` cả ${c.megas!.length} dạng Mega!` : ' Mega.'}
                  </Text>
                )}
              </>
            )}

            {stage === 0 ? (
              <Text style={styles.hint}>
                Chưa rõ trứng sẽ nở ra loài gì đâu! Hoàn thành mỗi ngày để nở trứng và khám phá Pokémon bí ẩn của bạn ✨
              </Text>
            ) : !finalReached ? (
              <Text style={styles.hint}>
                Đạt {STAGE_XP[3]} XP để tiến hoá dạng cuối (vẫn còn là ẩn số!). Giữ chuỗi ≥ {BRANCH_STREAK} ngày (kỷ lục)
                để nhận bản Shiny ✨
              </Text>
            ) : null}

            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Đóng</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TreeNode({ formId, name, active, passed, revealed }: { formId: number | null; name: string; active: boolean; passed: boolean; revealed: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.nodeWrap}>
      <View style={[styles.node, active && styles.nodeActive, passed && styles.nodePassed, !active && !passed && styles.nodeLocked]}>
        {revealed ? <CreatureImage formId={formId} size={46} /> : <Text style={styles.mystery}>?</Text>}
      </View>
      <Text style={[styles.nodeName, active && styles.nodeNameActive]} numberOfLines={1}>{revealed ? name : '???'}</Text>
    </View>
  );
}

function BranchNode({ formId, shiny, name, tag, tagColor, active, dim, revealed }: { formId: number; shiny: boolean; name: string; tag: string; tagColor: string; active: boolean; dim: boolean; revealed: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.branchRow}>
      <View style={[styles.node, styles.branchNode, { borderColor: tagColor }, active && { backgroundColor: tagColor + '22' }, dim && styles.branchDim]}>
        {revealed ? <CreatureImage formId={formId} shiny={shiny} size={50} /> : <Text style={styles.mystery}>?</Text>}
      </View>
      <View>
        <Text style={[styles.branchName, dim && styles.dimText]} numberOfLines={1}>{revealed ? name : '???'}</Text>
        <Text style={[styles.branchTag, { color: tagColor }, dim && styles.dimText]}>{tag}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '92%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  hero: { alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: spacing.md, textAlign: 'center' },
  formName: { fontSize: 16, fontWeight: '800', marginTop: spacing.xs },
  typeRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginTop: spacing.sm },
  pillText: { fontSize: 13, fontWeight: '700' },
  barBlock: { marginTop: spacing.lg },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  barLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  barVal: { color: colors.textDim, fontSize: 12 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.xl },
  stat: { alignItems: 'center', flex: 1 },
  statIcon: { fontSize: 18 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  statLabel: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  section: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: spacing.xl, marginBottom: spacing.md },
  tree: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  nodeWrap: { alignItems: 'center', width: 60 },
  node: { width: 54, height: 54, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  nodeActive: { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
  nodePassed: { borderColor: colors.green + '88' },
  nodeLocked: { opacity: 0.5 },
  mystery: { color: colors.textDim, fontSize: 24, fontWeight: '900' },
  nodeName: { color: colors.textDim, fontSize: 10, marginTop: 3, textAlign: 'center' },
  nodeNameActive: { color: colors.text, fontWeight: '700' },
  arrow: { color: colors.textDim, fontSize: 14 },
  fork: { gap: spacing.sm },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  branchNode: { borderWidth: 2, width: 56, height: 56 },
  branchDim: { opacity: 0.55 },
  dimText: { opacity: 0.5 },
  branchName: { color: colors.text, fontSize: 13, fontWeight: '700', maxWidth: 150 },
  branchTag: { fontSize: 11, fontWeight: '700' },
  megaRow: { flexDirection: 'row', gap: spacing.sm },
  megaCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  megaCardActive: { borderColor: colors.accent, backgroundColor: colors.accent + '1A', borderWidth: 2 },
  megaCardLocked: { opacity: 0.6 },
  megaImgWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  megaLock: { fontSize: 24 },
  megaName: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4, maxWidth: '96%', textAlign: 'center' },
  megaTag: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  hint: { color: colors.textDim, fontSize: 12, marginTop: spacing.lg, lineHeight: 17, textAlign: 'center' },
  closeBtn: { marginTop: spacing.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  closeText: { color: colors.text, fontWeight: '700', fontSize: 15 },
});

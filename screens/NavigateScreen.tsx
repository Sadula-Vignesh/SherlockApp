import React from 'react';
import {FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNav} from '../src/navController';

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtDur(s: number): string {
  const min = Math.round(s / 60);
  return min >= 1 ? `${min} min` : `${s}s`;
}

const NavigateScreen = () => {
  const {
    status,
    destination,
    route,
    currentStepIndex,
    position,
    piOk,
    stopNavigation,
  } = useNav();

  const piLabel =
    piOk === null ? 'Pi: not sent yet' : piOk ? 'Pi: connected ✓' : 'Pi: unreachable ✗';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.status}>Status: {status}</Text>
        <Text style={[styles.pi, {color: piOk === false ? '#C62828' : '#2E7D32'}]}>
          {piLabel}
        </Text>
        {destination ? (
          <Text style={styles.dest}>To: {destination}</Text>
        ) : (
          <Text style={styles.muted}>No destination yet — set one on the Home tab.</Text>
        )}
        {route ? (
          <Text style={styles.muted}>
            {fmtDist(route.distanceMeters)} · {fmtDur(route.durationSeconds)} ·{' '}
            {route.steps.length} steps
          </Text>
        ) : null}
        {position ? (
          <Text style={styles.muted}>
            GPS: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.muted}>GPS: waiting for a fix…</Text>
        )}
      </View>

      <FlatList
        data={route?.steps ?? []}
        keyExtractor={s => String(s.index)}
        ListEmptyComponent={
          <Text style={styles.empty}>Turn-by-turn steps will appear here.</Text>
        }
        renderItem={({item}) => {
          const active = item.index === currentStepIndex && status === 'navigating';
          return (
            <View style={[styles.step, active && styles.stepActive]}>
              <Text style={[styles.stepText, active && styles.stepTextActive]}>
                {item.index + 1}. {item.instruction || item.maneuver}
              </Text>
              <Text style={styles.stepDist}>{fmtDist(item.distanceMeters)}</Text>
            </View>
          );
        }}
      />

      {route ? (
        <TouchableOpacity
          style={styles.stopBtn}
          onPress={stopNavigation}
          accessibilityRole="button">
          <Text style={styles.stopText}>Stop navigation</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee'},
  status: {fontSize: 18, fontWeight: '700', textTransform: 'capitalize'},
  pi: {fontSize: 15, fontWeight: '600', marginTop: 4},
  dest: {fontSize: 17, marginTop: 8},
  muted: {fontSize: 14, color: '#666', marginTop: 4},
  empty: {textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15},
  step: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  stepActive: {backgroundColor: '#E0F2F1'},
  stepText: {fontSize: 16, flex: 1, paddingRight: 12, color: '#222'},
  stepTextActive: {fontWeight: '700', color: '#00695C'},
  stepDist: {fontSize: 14, color: '#888'},
  stopBtn: {backgroundColor: '#C62828', padding: 16, alignItems: 'center'},
  stopText: {color: '#fff', fontSize: 17, fontWeight: '700'},
});

export default NavigateScreen;

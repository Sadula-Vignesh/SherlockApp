import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNav} from '../src/navController';

const STATUS_COLOR: Record<string, string> = {
  idle: '#1565C0',
  listening: '#2E7D32',
  routing: '#EF6C00',
  navigating: '#00695C',
  arrived: '#2E7D32',
  error: '#C62828',
};

const HomeScreen = () => {
  const {status, statusText, destination, wakeInfo, lastError, beginVoiceInput} =
    useNav();

  return (
    // The whole screen is the button — a blind user can tap anywhere to start.
    <Pressable
      style={[styles.container, {backgroundColor: STATUS_COLOR[status] ?? '#1565C0'}]}
      onPress={beginVoiceInput}
      accessibilityRole="button"
      accessibilityLabel="Sherlock. Tap anywhere to speak a destination."
      accessibilityHint="Double tap to start listening">
      <Text style={styles.brand}>Sherlock</Text>

      <View style={styles.center}>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {statusText}
        </Text>
        {destination ? (
          <Text style={styles.destination}>Destination: {destination}</Text>
        ) : null}
        {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
      </View>

      <Text style={styles.hint}>Tap anywhere to speak</Text>
      <Text style={styles.wake}>{wakeInfo}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, paddingVertical: 32, paddingHorizontal: 24},
  brand: {color: 'rgba(255,255,255,0.85)', fontSize: 22, fontWeight: '700', textAlign: 'center'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  status: {color: '#fff', fontSize: 30, fontWeight: '700', textAlign: 'center', lineHeight: 40},
  destination: {color: '#fff', fontSize: 20, marginTop: 20, textAlign: 'center'},
  error: {color: '#FFEBEE', fontSize: 18, marginTop: 20, textAlign: 'center'},
  hint: {color: 'rgba(255,255,255,0.9)', fontSize: 18, textAlign: 'center', marginBottom: 8},
  wake: {color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center'},
});

export default HomeScreen;

import React, {useEffect, useState} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Config, WAKE_WORDS, WakeWord, saveConfig} from '../src/config';
import {useNav} from '../src/navController';

const SettingsScreen = () => {
  const {config, reloadConfig, testPi} = useNav();
  const [form, setForm] = useState<Config>(config);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Sync local form when the stored config loads/changes.
  useEffect(() => {
    setForm(config);
  }, [config]);

  const set = <K extends keyof Config>(k: K, v: Config[K]) =>
    setForm(f => ({...f, [k]: v}));

  const onSave = async () => {
    setSaving(true);
    try {
      const clean: Config = {
        ...form,
        googleApiKey: form.googleApiKey.trim(),
        piHost: form.piHost.trim(),
        piPort: form.piPort.trim() || '8000',
        picovoiceKey: form.picovoiceKey.trim(),
      };
      await saveConfig(clean);
      await reloadConfig();
      Alert.alert('Saved', 'Settings saved and wake word restarted.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const onTestPi = async () => {
    setTesting(true);
    try {
      // Save first so the test uses the values on screen.
      await saveConfig({...form, piHost: form.piHost.trim(), piPort: form.piPort.trim() || '8000'});
      await reloadConfig();
      const ok = await testPi();
      Alert.alert(
        ok ? 'Pi reachable ✓' : 'Pi unreachable ✗',
        ok
          ? `Reached the Pi at ${form.piHost}:${form.piPort || '8000'}.`
          : 'No response. Check the IP/port, that the Pi (or mock server) is running, and that the phone is on the same Wi-Fi.',
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          label="Google Routes API key"
          hint="Required for routing. See SETUP.md."
          value={form.googleApiKey}
          onChangeText={t => set('googleApiKey', t)}
          placeholder="AIza…"
          secure
        />

        <View style={styles.row}>
          <View style={{flex: 2, marginRight: 8}}>
            <Field
              label="Raspberry Pi IP"
              value={form.piHost}
              onChangeText={t => set('piHost', t)}
              placeholder="192.168.1.50"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={{flex: 1}}>
            <Field
              label="Port"
              value={form.piPort}
              onChangeText={t => set('piPort', t)}
              placeholder="8000"
              keyboardType="number-pad"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={onTestPi}
          disabled={testing}>
          <Text style={styles.btnSecondaryText}>
            {testing ? 'Testing…' : 'Test Pi connection'}
          </Text>
        </TouchableOpacity>

        <Field
          label="Picovoice AccessKey"
          hint="Required for the hands-free wake word. Free at console.picovoice.ai."
          value={form.picovoiceKey}
          onChangeText={t => set('picovoiceKey', t)}
          placeholder="Picovoice AccessKey"
          secure
        />

        <Text style={styles.label}>Wake word</Text>
        <View style={styles.chips}>
          {WAKE_WORDS.map(w => (
            <TouchableOpacity
              key={w}
              style={[styles.chip, form.wakeWord === w && styles.chipActive]}
              onPress={() => set('wakeWord', w as WakeWord)}>
              <Text style={[styles.chipText, form.wakeWord === w && styles.chipTextActive]}>
                {w}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Toggle
          label="Hands-free wake word"
          hint="Listen for the wake word. Off = tap the Home screen to start."
          value={form.wakeWordEnabled}
          onValueChange={v => set('wakeWordEnabled', v)}
        />
        <Toggle
          label="Announce app status"
          hint="Announces status ('Listening', 'Route found') via the screen reader (TalkBack). Navigation itself is spoken by the cane."
          value={form.ttsFeedback}
          onValueChange={v => set('ttsFeedback', v)}
        />

        <TouchableOpacity style={styles.btn} onPress={onSave} disabled={saving}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

type FieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: any;
};
const Field = ({label, hint, value, onChangeText, placeholder, secure, keyboardType}: FieldProps) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#aaa"
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={secure}
      keyboardType={keyboardType}
    />
  </View>
);

type ToggleProps = {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
};
const Toggle = ({label, hint, value, onValueChange}: ToggleProps) => (
  <View style={styles.toggle}>
    <View style={{flex: 1, paddingRight: 12}}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
    <Switch value={value} onValueChange={onValueChange} />
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  content: {padding: 16, paddingBottom: 48},
  field: {marginBottom: 16},
  row: {flexDirection: 'row'},
  label: {fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 4},
  hint: {fontSize: 13, color: '#777', marginBottom: 6},
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8},
  chip: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {backgroundColor: '#1565C0', borderColor: '#1565C0'},
  chipText: {color: '#444', fontSize: 14},
  chipTextActive: {color: '#fff', fontWeight: '700'},
  toggle: {flexDirection: 'row', alignItems: 'center', marginBottom: 16},
  btn: {
    backgroundColor: '#1565C0',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: {color: '#fff', fontSize: 17, fontWeight: '700'},
  btnSecondary: {backgroundColor: '#ECEFF1', marginTop: 0, marginBottom: 16},
  btnSecondaryText: {color: '#1565C0', fontSize: 16, fontWeight: '700'},
});

export default SettingsScreen;

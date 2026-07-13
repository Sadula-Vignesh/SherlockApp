import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Button, PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import Tts from 'react-native-tts';
import { Buffer } from 'buffer';

const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

const bleManager = new BleManager();

const HomeScreen = () => {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const deviceRef = useRef<Device | null>(null);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
  };

  const scanAndConnect = async () => {
    await requestPermissions();
    setStatus('Scanning...');

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setStatus('Scan error: ' + error.message);
        return;
      }
      if (device?.name === 'ESP32_Sherlock') {
        bleManager.stopDeviceScan();
        connectToDevice(device);
      }
    });
  };

  const connectToDevice = async (device: Device) => {
    try {
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      deviceRef.current = connectedDevice;
      setConnected(true);
      setStatus('Connected');

      connectedDevice.monitorCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            console.log('Monitor error', error);
            return;
          }
          if (characteristic?.value) {
            const decoded = Buffer.from(characteristic.value, 'base64').toString('utf-8');
            handleIncomingData(decoded);
          }
        }
      );
    } catch (e) {
      setStatus('Connection failed');
    }
  };

  const [lastMessage, setLastMessage] = useState('No data yet');

  const handleIncomingData = (jsonString: string) => {
    setLastMessage(jsonString); // show raw data first, to debug
    try {
      const data = JSON.parse(jsonString);
      if (data.message) {
        Tts.speak(data.message);
      }
    } catch (e) {
      console.log('Bad JSON from ESP32:', jsonString);
    }
  };

  useEffect(() => {
    return () => {
      bleManager.stopDeviceScan();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Home</Text>
      <Text style={styles.status}>{status}</Text>
      <Button title={connected ? 'Connected' : 'Connect to ESP32'} onPress={scanAndConnect} disabled={connected} />
      <Text style={styles.status}>{lastMessage}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 24, marginBottom: 10 },
  status: { fontSize: 16, marginBottom: 20, color: 'gray' },
});

export default HomeScreen;
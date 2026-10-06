import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';

export default function App() {
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();
  const [mediaPermissionResponse, requestMediaPermission] = MediaLibrary.usePermissions();
  
  const [cameraPosition, setCameraPosition] = useState('back');
  const device = useCameraDevice(cameraPosition);
  
  const cameraRef = useRef(null);
  
  // UI States
  const [isRecording, setIsRecording] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [savedChunks, setSavedChunks] = useState(0);
  
  // Logic Refs (To prevent stale closures during rapid state changes)
  const isRecordingRef = useRef(false);
  const pendingFlipRef = useRef(false);

  // 1. Handle Permissions
  useEffect(() => {
    (async () => {
      if (!hasCameraPermission) await requestCameraPermission();
      if (!hasMicrophonePermission) await requestMicrophonePermission();
      if (mediaPermissionResponse?.status !== 'granted') await requestMediaPermission();
    })();
  }, [hasCameraPermission, hasMicrophonePermission, mediaPermissionResponse]);

  // Reset ready state when camera physically swaps
  useEffect(() => {
    setIsCameraReady(false);
  }, [cameraPosition]);

  // 2. Start Recording
  const startRecording = () => {
    if (!cameraRef.current || !device || !isCameraReady) {
      Alert.alert("Wait", "Camera is warming up.");
      return;
    }
    
    if (typeof cameraRef.current.startRecording !== 'function') {
      Alert.alert("Error", "Your phone's camera software does not support this recording API.");
      return;
    }

    isRecordingRef.current = true;
    setIsRecording(true);
    setSavedChunks(0);
    
    triggerNativeRecord();
  };
  
  const triggerNativeRecord = () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    
    try {
      cameraRef.current.startRecording({
        onRecordingFinished: async (video) => {
          // Attempt to save to Gallery
          try {
             const uri = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
             await MediaLibrary.saveToLibraryAsync(uri);
             setSavedChunks(prev => prev + 1);
          } catch(e) { 
             Alert.alert("Gallery Save Error", String(e)); 
          }
          
          // Check if we need to flip or stop
          if (pendingFlipRef.current) {
            pendingFlipRef.current = false;
            setCameraPosition(p => p === 'back' ? 'front' : 'back');
            // The useEffect below will auto-resume recording when the new camera is ready
          } else if (!isRecordingRef.current) {
            Alert.alert("Success!", "Recording stopped and saved to gallery.");
          }
        },
        onRecordingError: (error) => {
          Alert.alert("Native Recording Error", error.message || String(error));
          stopRecordingState();
        },
      });
    } catch (e) {
      Alert.alert("Crash Error", String(e));
      stopRecordingState();
    }
  };

  // Helper to safely reset UI on crash
  const stopRecordingState = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsFlipping(false);
    pendingFlipRef.current = false;
  };

  // 3. Stop Recording
  const stopRecording = async () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    
    try {
      if (typeof cameraRef.current.stopRecording === 'function') {
        await cameraRef.current.stopRecording();
      }
    } catch (e) { 
      Alert.alert("Stop Error", String(e)); 
    }
  };

  // 4. Flip Camera
  const flipCamera = async () => {
    if (!isRecordingRef.current) {
      // Just visually flip if not recording
      setCameraPosition(p => p === 'back' ? 'front' : 'back');
      return;
    }
    
    if (isFlipping) return;
    
    // Safely stop the current chunk, wait for it to save, then flip
    setIsFlipping(true);
    pendingFlipRef.current = true;
    
    try {
      if (typeof cameraRef.current.stopRecording === 'function') {
        await cameraRef.current.stopRecording();
      }
    } catch (e) { 
      Alert.alert("Flip Error", String(e)); 
      setIsFlipping(false);
      pendingFlipRef.current = false;
    }
  };

  // Auto-resume recording after a flip is completed and the new lens is ready
  useEffect(() => {
    if (isRecordingRef.current && isCameraReady && device) {
      const timer = setTimeout(() => {
        setIsFlipping(false);
        triggerNativeRecord();
      }, 300); // 300ms buffer for Samsung hardware
      return () => clearTimeout(timer);
    }
  }, [isCameraReady, device]);

  // Loading States
  if (!hasCameraPermission || !hasMicrophonePermission) {
    return (
      <View style={styles.container}>
        <Text style={{color: 'white', alignSelf: 'center'}}>Requesting permissions...</Text>
      </View>
    );
  }

  if (device == null) {
    return <View style={styles.container}><ActivityIndicator size="large" color="white" /></View>;
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
        onInitialized={() => setIsCameraReady(true)}
      />
      
      {/* UI Controls Overlay */}
      <View style={styles.controls}>
        {isFlipping ? (
           <ActivityIndicator size="large" color="white" />
        ) : (
          <>
            <TouchableOpacity style={styles.flipBtn} onPress={flipCamera}>
              <Text style={styles.text}>FLIP</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.recordBtn, isRecording && styles.recordingActive, !isCameraReady && {opacity: 0.5}]} 
              onPress={isRecording ? stopRecording : startRecording}
              disabled={!isCameraReady}
            >
              <Text style={styles.text}>{isRecording ? 'STOP' : 'REC'}</Text>
            </TouchableOpacity>
            
            <View style={{width: 60, alignItems: 'center'}}>
               {savedChunks > 0 && <Text style={{color:'white'}}>Saved: {savedChunks}</Text>}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'red',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  recordingActive: {
    backgroundColor: 'darkred',
    borderRadius: 20,
  },
  flipBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontWeight: 'bold',
  }
});

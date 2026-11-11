import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission, useVideoOutput } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { mergeVideos } from './modules/flipcam-merge';

export default function App() {
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();
  const [mediaPermissionResponse, requestMediaPermission] = MediaLibrary.usePermissions();
  
  const [cameraPosition, setCameraPosition] = useState('back');
  const device = useCameraDevice(cameraPosition);
  
  const cameraRef = useRef(null);
  const recorderRef = useRef(null);
  const videoOutput = useVideoOutput({ enableAudio: true });
  
  // UI States
  const [isRecording, setIsRecording] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [savedChunks, setSavedChunks] = useState(0);
  const [isMerging, setIsMerging] = useState(false);
  
  // Logic Refs (To prevent stale closures during rapid state changes)
  const isRecordingRef = useRef(false);
  const pendingFlipRef = useRef(false);
  const chunkPathsRef = useRef([]);

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
    if (!device || !isCameraReady) {
      Alert.alert("Wait", "Camera is warming up.");
      return;
    }
    
    isRecordingRef.current = true;
    setIsRecording(true);
    setSavedChunks(0);
    chunkPathsRef.current = [];
    
    triggerNativeRecord();
  };
  
  const triggerNativeRecord = async () => {
    if (!isRecordingRef.current) return;
    
    try {
      const recorder = await videoOutput.createRecorder({});
      recorderRef.current = recorder;

      recorder.startRecording(
        async (filePath, reason) => {
          // onRecordingFinished: just remember the clip; merge happens on final stop
          const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
          chunkPathsRef.current.push(uri);
          setSavedChunks(chunkPathsRef.current.length);

          if (pendingFlipRef.current) {
            pendingFlipRef.current = false;
            setCameraPosition(p => p === 'back' ? 'front' : 'back');
            // The effect below auto-resumes recording when the new camera is ready
          } else if (!isRecordingRef.current) {
            await finalizeRecording();
          }
        },
        (error) => {
          // onRecordingError
          Alert.alert("Native Recording Error", error.message || String(error));
          stopRecordingState();
        }
      );
    } catch (e) {
      Alert.alert("Crash Error", String(e));
      stopRecordingState();
    }
  };

  // Merge all clips into ONE video, save to gallery, clean up temp files
  const finalizeRecording = async () => {
    const clips = chunkPathsRef.current;
    chunkPathsRef.current = [];
    if (clips.length === 0) return;
    setIsMerging(true);
    const cleanup = (list) => list.forEach((u) => { try { new File(u).delete(); } catch (e) {} });
    try {
      if (clips.length === 1) {
        await MediaLibrary.saveToLibraryAsync(clips[0]);
      } else {
        const out = `${Paths.cache.uri}flipcam_${Date.now()}.mp4`;
        const merged = await mergeVideos(clips, out);
        const mergedUri = merged.startsWith('file://') ? merged : `file://${merged}`;
        await MediaLibrary.saveToLibraryAsync(mergedUri);
        cleanup([mergedUri]);
      }
      cleanup(clips);
      Alert.alert("Success!", "Recording saved to gallery as one video.");
    } catch (e) {
      // Fallback: never lose footage - save the clips separately
      try {
        for (const c of clips) await MediaLibrary.saveToLibraryAsync(c);
        Alert.alert("Merge failed", "Saved as separate clips instead. " + String(e));
      } catch (e2) {
        Alert.alert("Gallery Save Error", String(e2));
      }
    } finally {
      setIsMerging(false);
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
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    
    try {
      if (recorderRef.current) {
        await recorderRef.current.stopRecording();
        recorderRef.current = null;
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
      if (recorderRef.current) {
        await recorderRef.current.stopRecording();
        recorderRef.current = null;
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
        outputs={[videoOutput]}
        onInitialized={() => setIsCameraReady(true)}
      />
      
      {/* UI Controls Overlay */}
      <View style={styles.controls}>
        {isFlipping || isMerging ? (
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
               {savedChunks > 0 && <Text style={{color:'white'}}>Clips: {savedChunks}</Text>}
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

import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';

export default function App() {
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();
  const [mediaPermissionResponse, requestMediaPermission] = MediaLibrary.usePermissions();
  
  const [cameraPosition, setCameraPosition] = useState('back');
  const device = useCameraDevice(cameraPosition);
  
  const cameraRef = useRef(null);
  
  const [isRecordingUI, setIsRecordingUI] = useState(false);
  const [isFlippingUI, setIsFlippingUI] = useState(false);
  const [cameraIsReady, setCameraIsReady] = useState(false);
  const [segmentsCount, setSegmentsCount] = useState(0);
  
  const isRecordingRef = useRef(false);
  const pendingFlipRef = useRef(false);
  const segmentsRef = useRef([]);

  useEffect(() => {
    (async () => {
      if (!hasCameraPermission) await requestCameraPermission();
      if (!hasMicrophonePermission) await requestMicrophonePermission();
      if (mediaPermissionResponse?.status !== 'granted') await requestMediaPermission();
    })();
  }, [hasCameraPermission, hasMicrophonePermission, mediaPermissionResponse]);

  // Reset ready state when camera hardware changes
  useEffect(() => {
    setCameraIsReady(false);
  }, [cameraPosition]);

  const startRecording = async () => {
    if (!cameraRef.current || !device || !cameraIsReady) {
      alert("Please wait for the camera to fully initialize!");
      return;
    }
    isRecordingRef.current = true;
    setIsRecordingUI(true);
    segmentsRef.current = [];
    setSegmentsCount(0);
    recordSegment();
  };
  
  const recordSegment = () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    
    if (typeof cameraRef.current.startRecording !== 'function') {
      alert("Start Error: The camera hardware on this device is blocking the video recording function right now.");
      setIsRecordingUI(false);
      isRecordingRef.current = false;
      setIsFlippingUI(false);
      return;
    }
    
    try {
      cameraRef.current.startRecording({
        onRecordingFinished: async (video) => {
          segmentsRef.current.push(video.path);
          setSegmentsCount(segmentsRef.current.length);
          
          try {
             const localUri = video.path.startsWith('file://') ? video.path : 'file://' + video.path;
             await MediaLibrary.saveToLibraryAsync(localUri);
          } catch(e) { 
             alert("Failed to save to gallery: " + String(e)); 
          }
          
          if (pendingFlipRef.current) {
            pendingFlipRef.current = false;
            setCameraPosition(p => p === 'back' ? 'front' : 'back');
          } 
          else if (!isRecordingRef.current) {
            alert(`POC SUCCESS!\nSuccessfully safely saved ${segmentsRef.current.length} hot-swapped clips to Gallery!`);
          }
        },
        onRecordingError: (error) => {
          alert("Recording Error: " + error.message);
          setIsRecordingUI(false);
          isRecordingRef.current = false;
          setIsFlippingUI(false);
          pendingFlipRef.current = false;
        },
      });
    } catch (e) {
      alert("Start Error: " + String(e));
      setIsRecordingUI(false);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecordingUI(false);
    
    if (typeof cameraRef.current.stopRecording === 'function') {
       try {
         await cameraRef.current.stopRecording();
       } catch (e) { alert("Stop Error: " + String(e)); }
    }
  };

  const flipCamera = async () => {
    if (!isRecordingRef.current) {
      setCameraPosition(p => p === 'back' ? 'front' : 'back');
      return;
    }
    
    if (isFlippingUI) return;
    
    setIsFlippingUI(true);
    pendingFlipRef.current = true;
    
    if (typeof cameraRef.current.stopRecording === 'function') {
      try {
        await cameraRef.current.stopRecording();
      } catch (e) { 
        alert("Flip Stop Error: " + String(e)); 
        setIsFlippingUI(false);
        pendingFlipRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (isRecordingRef.current && device && cameraIsReady) {
      const timer = setTimeout(() => {
        setIsFlippingUI(false);
        recordSegment();
      }, 300); 
      return () => clearTimeout(timer);
    }
  }, [cameraIsReady]);

  if (!hasCameraPermission || !hasMicrophonePermission) {
    return (
      <View style={styles.container}>
        <Text style={{color: 'white', alignSelf: 'center'}}>Requesting permissions...</Text>
      </View>
    );
  }

  if (device == null) return <View style={styles.container}><ActivityIndicator size="large" color="white" /></View>;

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
        onInitialized={() => setCameraIsReady(true)}
      />
      
      {/* Overlay UI */}
      <View style={styles.controls}>
        {isFlippingUI ? (
           <ActivityIndicator size="large" color="white" />
        ) : (
          <>
            <TouchableOpacity style={styles.flipBtn} onPress={flipCamera}>
              <Text style={styles.text}>FLIP</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.recordBtn, isRecordingUI && styles.recordingActive, !cameraIsReady && {opacity: 0.5}]} 
              onPress={isRecordingUI ? stopRecording : startRecording}
            >
              <Text style={styles.text}>{isRecordingUI ? 'STOP' : 'REC'}</Text>
            </TouchableOpacity>
            
            <View style={{width: 60, alignItems: 'center'}}>
               {segmentsCount > 0 && <Text style={{color:'white'}}>Saved: {segmentsCount}</Text>}
            </View>
          </>
        )}
      </View>
      
      {!cameraIsReady && (
        <View style={StyleSheet.absoluteFill}>
          <ActivityIndicator size="large" color="red" style={{marginTop: 50}} />
        </View>
      )}
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

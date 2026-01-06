import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Platform, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useEffect, useMemo, useRef, useState } from 'react';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const baseUrl = 'https://todo.o9p.net';
  const webViewRef = useRef(null);
  const notificationListener = useRef();
  const responseListener = useRef();

  const [currentUrl, setCurrentUrl] = useState(baseUrl);
  const [expoPushToken, setExpoPushToken] = useState('');

  // Register for push notifications
  async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3b82f6',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          'Push Notifications',
          'Enable notifications to get updates about your tasks!',
          [{ text: 'OK' }]
        );
        return;
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId: '678b835a-c433-46ac-81d5-f40ec9b5bf54',
      })).data;
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  // Send push token to server
  async function sendPushTokenToServer(token) {
    if (!token) return;

    try {
      const response = await fetch(`${baseUrl}/api/user/push-token`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          platform: Platform.OS,
          deviceName: Device.deviceName || 'Unknown Device',
        }),
      });

      if (!response.ok) {
        console.error('Failed to register push token with server');
      } else {
        console.log('Push token registered successfully');
      }
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  }

  const normalizeToWebUrl = useMemo(() => {
    return (incomingUrl) => {
      if (!incomingUrl) return null;

      // Already a web URL to our domain
      if (incomingUrl.startsWith(`${baseUrl}`)) return incomingUrl;

      // Handle custom scheme todo://...
      try {
        const u = new URL(incomingUrl);
        if (u.protocol === 'todo:') {
          const path = (u.pathname && u.pathname !== '/') ? u.pathname : '';
          return `${baseUrl}${path}${u.search || ''}${u.hash || ''}`;
        }
      } catch (_e) {
        // ignore
      }

      return null;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const initial = await Linking.getInitialURL();
        const normalized = normalizeToWebUrl(initial);
        if (isMounted && normalized) {
          setCurrentUrl(normalized);
        }
      } catch (_e) {
        // ignore
      }

      // Register for push notifications
      const token = await registerForPushNotificationsAsync();
      if (token) {
        setExpoPushToken(token);
        await sendPushTokenToServer(token);
      }
    };

    init();

    const sub = Linking.addEventListener('url', ({ url }) => {
      const normalized = normalizeToWebUrl(url);
      if (!normalized) return;
      setCurrentUrl(normalized);
      // If the webview is already loaded, navigate immediately.
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(
          `window.location.href = ${JSON.stringify(normalized)}; true;`
        );
      }
    });

    // Handle notification received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Handle notification tapped/clicked
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;

      // Navigate to specific URL if provided in notification
      if (data.url) {
        const normalized = normalizeToWebUrl(data.url);
        if (normalized) {
          setCurrentUrl(normalized);
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(
              `window.location.href = ${JSON.stringify(normalized)}; true;`
            );
          }
        }
      }
    });

    return () => {
      isMounted = false;
      sub.remove();

      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [normalizeToWebUrl]);

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        originWhitelist={['https://*']}
        // Persistence settings
        incognito={false}
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        // iOS cookie persistence
        allowsBackForwardNavigationGestures={true}
        // Android specific
        setSupportMultipleWindows={false}
        mixedContentMode="compatibility"
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function App() {
  const baseUrl = 'https://todo.o9p.net';
  const webViewRef = useRef(null);

  const [currentUrl, setCurrentUrl] = useState(baseUrl);

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

    return () => {
      isMounted = false;
      sub.remove();
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

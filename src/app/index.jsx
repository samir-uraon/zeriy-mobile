
import * as Location from "expo-location";
import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";

import {
  StyleSheet,
  View,
  StatusBar,
  Alert,
  BackHandler,
  Image,
  Text,
  ActivityIndicator,
  Animated,
} from "react-native";

import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import * as Notifications from "expo-notifications";

import { registerForPushNotifications } from "../../lib/notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

WebBrowser.maybeCompleteAuthSession();

// ==========================================
// CONFIGURATION
// ==========================================

const WEBSITE_URL = "https://zeriy.vercel.app";
const MOBILE_LOGIN_URL = `${WEBSITE_URL}/mobile-login`;

const AUTH_CALLBACK_URL = Linking.createURL("auth/callback");

const PRIMARY_COLOR = "#6C3CE9";
const SPLASH_BACKGROUND = "#080824";

const processedCodes = new Set();

// ==========================================
// EXTERNAL LINKS
// ==========================================

const isMapsUrl = (url) =>
  (/^https?:\/\/(www\.)?google\.[a-z.]+\/maps/i.test(url) ||
    /^https?:\/\/maps\.google\.[a-z.]+/i.test(url) ||
    /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url)) &&
  !/\/maps\/embed/i.test(url);

const intentToHttps = (url) => {
  const m = url.match(/^intent:\/\/(.*?)#Intent;(.*)$/i);

  if (!m) return null;

  const scheme = (m[2].match(/scheme=([^;]+)/) || [])[1] || "https";

  return `${scheme}://${m[1]}`;
};

const openExternal = async (rawUrl) => {
  let url = rawUrl;

  if (/^intent:/i.test(url)) {
    url = intentToHttps(url) || url;
  }

  try {
    await Linking.openURL(url);
  } catch (e) {
    console.log("Could not open external URL:", url, e);

    Alert.alert(
      "Unable to open",
      "No app was found to open this link."
    );
  }
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function HomeScreen() {
  const [showSplash, setShowSplash] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [source, setSource] = useState({
    uri: WEBSITE_URL,
  });

  const routeParams = useLocalSearchParams();

  const webViewRef = useRef(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const splashHidden = useRef(false);

  const loginInProgress = useRef(false);
  const exchangeInProgress = useRef(false);
  const exchangeTimer = useRef(null);
  const exchangeNavigationSeen = useRef(false);

  // ==========================================
  // HIDE SPLASH
  // ==========================================

  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;

    splashHidden.current = true;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowSplash(false);
      }
    });
  }, [fadeAnim]);

  // ==========================================
  // SESSION EXCHANGE
  // ==========================================

  const performSessionExchange = useCallback((code) => {
    if (!code || processedCodes.has(code)) return;

    processedCodes.add(code);

    exchangeInProgress.current = true;
    exchangeNavigationSeen.current = false;

    setAuthLoading(true);

    const exchangeUrl =
      `${WEBSITE_URL}/api/mobile-auth/exchange?code=` +
      encodeURIComponent(code);

    if (exchangeTimer.current) {
      clearTimeout(exchangeTimer.current);
    }

    exchangeTimer.current = setTimeout(() => {
      if (exchangeInProgress.current) {
        exchangeInProgress.current = false;
        exchangeNavigationSeen.current = false;

        setAuthLoading(false);

        Alert.alert(
          "Login failed",
          "Session exchange timed out. Please try again."
        );
      }
    }, 30000);

    setSource({
      uri: exchangeUrl,
    });
  }, []);

  // ==========================================
  // ROUTE PARAMS
  // ==========================================

  useEffect(() => {
    const code = routeParams?.code || routeParams?.auth_code;

    if (code) {
      performSessionExchange(String(code));
    }
  }, [routeParams, performSessionExchange]);

  // ==========================================
  // DEEP LINKS
  // ==========================================

  useEffect(() => {
    const handleUrlEvent = (event) => {
      if (!event?.url) return;

      try {
        const parsed = Linking.parse(event.url);

        const code =
          parsed.queryParams?.code ||
          parsed.queryParams?.auth_code;

        if (code) {
          performSessionExchange(String(code));
          return;
        }
      } catch (e) {
        console.log("Deep link parse error:", e);
      }

      const match = event.url.match(
        /[?&](?:code|auth_code)=([^&]+)/
      );

      if (match?.[1]) {
        performSessionExchange(
          decodeURIComponent(match[1])
        );
      }
    };

    const subscription = Linking.addEventListener(
      "url",
      handleUrlEvent
    );

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrlEvent({ url });
      }
    });

    return () => subscription.remove();
  }, [performSessionExchange]);

  // ==========================================
  // GOOGLE LOGIN
  // ==========================================

  const handleGoogleLogin = useCallback(async () => {
    if (
      loginInProgress.current ||
      exchangeInProgress.current
    ) {
      return;
    }

    loginInProgress.current = true;
    setAuthLoading(true);

    try {
      const result = await WebBrowser.openAuthSessionAsync(
        MOBILE_LOGIN_URL,
        AUTH_CALLBACK_URL
      );

      if (result.type === "success" && result.url) {
        let code = null;

        try {
          const parsed = Linking.parse(result.url);

          code =
            parsed.queryParams?.code ||
            parsed.queryParams?.auth_code;
        } catch (e) {
          console.log("Login URL parse error:", e);
        }

        if (!code) {
          const match = result.url.match(
            /[?&](?:code|auth_code)=([^&]+)/
          );

          if (match?.[1]) {
            code = decodeURIComponent(match[1]);
          }
        }

        if (code) {
          performSessionExchange(String(code));
        }
      }
    } catch (error) {
      console.error("Google login error:", error);

      if (!exchangeInProgress.current) {
        setAuthLoading(false);

        Alert.alert(
          "Login failed",
          error.message || "Unable to login."
        );
      }
    } finally {
      loginInProgress.current = false;

      setTimeout(() => {
        if (!exchangeInProgress.current) {
          setAuthLoading(false);
        }
      }, 1500);
    }
  }, [performSessionExchange]);

  // ==========================================
  // WEBSITE MESSAGE
  // ==========================================

  const handleWebViewMessage = useCallback(
    async (event) => {
      const message = event.nativeEvent.data;

      // Google Login
      if (message === "ZERIY_GOOGLE_LOGIN") {
        handleGoogleLogin();
        return;
      }

      // Native Push Notification
      if (message === "ZERIY_REGISTER_PUSH") {
        try {
          const token = await registerForPushNotifications();

          if (!token) {
            throw new Error(
              "Unable to generate Expo push token."
            );
          }

          webViewRef.current?.injectJavaScript(`
            window.dispatchEvent(
              new CustomEvent("ZERIY_PUSH_TOKEN", {
                detail: ${JSON.stringify(token)}
              })
            );
            true;
          `);
        } catch (error) {
          console.error("Native push error:", error);

          webViewRef.current?.injectJavaScript(`
            window.dispatchEvent(
              new CustomEvent("ZERIY_PUSH_ERROR", {
                detail: ${JSON.stringify(
                  error.message || "Push registration failed"
                )}
              })
            );
            true;
          `);
        }

        return;
      }

      // GPS REQUEST
      let payload;

      try {
        payload = JSON.parse(message);
      } catch {
        return;
      }

      if (
        payload?.type !== "ZERIY_GET_CURRENT_LOCATION"
      ) {
        return;
      }

      // Send GPS result to website
      const sendLocationResult = (result) => {
        webViewRef.current?.injectJavaScript(`
          window.dispatchEvent(
            new CustomEvent("zeriy:native-location", {
              detail: ${JSON.stringify({
                requestId: payload.requestId,
                ...result,
              })}
            })
          );
          true;
        `);
      };

      try {
        let { status } =
          await Location.getForegroundPermissionsAsync();

        if (status !== "granted") {
          const permission =
            await Location.requestForegroundPermissionsAsync();

          status = permission.status;
        }

        if (status !== "granted") {
          throw new Error(
            "Please allow location permission."
          );
        }

        const servicesEnabled =
          await Location.hasServicesEnabledAsync();

        if (!servicesEnabled) {
          throw new Error(
            "Please turn on Location/GPS on your phone."
          );
        }

        const position =
          await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

        sendLocationResult({
          success: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      } catch (error) {
        console.error("Native GPS error:", error);

        sendLocationResult({
          success: false,
          error:
            error.message ||
            "Unable to get current location.",
        });
      }
    },
    [handleGoogleLogin]
  );

  // ==========================================
  // WEBVIEW NAVIGATION
  // ==========================================

  const handleShouldStartLoadWithRequest = useCallback(
    (request) => {
      const { url } = request;

      // Keep embedded content inside WebView
      if (request.isTopFrame === false) {
        return true;
      }

      // Allow authentication exchange
      if (url.includes("mobile-auth/exchange")) {
        return true;
      }

      // External/non-web links
      if (!/^https?:\/\//i.test(url)) {
        if (
          /^(about:|data:|blob:|javascript:)/i.test(url)
        ) {
          return true;
        }

        openExternal(url);
        return false;
      }

      // Google Maps
      if (isMapsUrl(url)) {
        openExternal(url);
        return false;
      }

      // Google OAuth
      if (
        url.includes("accounts.google.com") ||
        (
          url.startsWith(WEBSITE_URL) &&
          url.includes("/mobile-login")
        )
      ) {
        handleGoogleLogin();
        return false;
      }

      return true;
    },
    [handleGoogleLogin]
  );

  // ==========================================
  // NAVIGATION STATE
  // ==========================================

  const handleNavigationChange = useCallback(
    (navState) => {
      setCanGoBack(navState.canGoBack);

      const url = navState.url || "";

      const isExchangeUrl = url.includes(
        "mobile-auth/exchange"
      );

      if (
        exchangeInProgress.current &&
        isExchangeUrl
      ) {
        exchangeNavigationSeen.current = true;
      }

      if (
        exchangeInProgress.current &&
        (
          exchangeNavigationSeen.current ||
          !isExchangeUrl
        ) &&
        url.startsWith(WEBSITE_URL) &&
        !isExchangeUrl
      ) {
        exchangeInProgress.current = false;
        exchangeNavigationSeen.current = false;

        if (exchangeTimer.current) {
          clearTimeout(exchangeTimer.current);
          exchangeTimer.current = null;
        }

        setAuthLoading(false);
      }
    },
    []
  );

  // ==========================================
  // WEBVIEW LOAD END
  // ==========================================

  const handleLoadEnd = useCallback(() => {
    hideSplash();
  }, [hideSplash]);

  // ==========================================
  // WEBVIEW ERROR
  // ==========================================

  const handleWebViewError = useCallback(
    (event) => {
      console.log(
        "WebView error:",
        event.nativeEvent
      );

      // Hide splash if initial website loading fails
      hideSplash();

      if (exchangeInProgress.current) {
        exchangeInProgress.current = false;
        exchangeNavigationSeen.current = false;

        if (exchangeTimer.current) {
          clearTimeout(exchangeTimer.current);
          exchangeTimer.current = null;
        }

        setAuthLoading(false);

        Alert.alert(
          "Login failed",
          "Unable to establish your session."
        );
      }
    },
    [hideSplash]
  );

  // ==========================================
  // HTTP ERROR
  // ==========================================

  const handleHttpError = useCallback((event) => {
    const { url, statusCode } = event.nativeEvent;

    console.log(
      "HTTP error:",
      statusCode,
      url
    );

    if (
      exchangeInProgress.current &&
      url.includes("/api/mobile-auth/exchange")
    ) {
      exchangeInProgress.current = false;
      exchangeNavigationSeen.current = false;

      if (exchangeTimer.current) {
        clearTimeout(exchangeTimer.current);
        exchangeTimer.current = null;
      }

      setAuthLoading(false);

      Alert.alert(
        "Authentication error",
        `Server error: ${statusCode}`
      );
    }
  }, []);

  // ==========================================
  // ANDROID BACK BUTTON
  // ==========================================

  useEffect(() => {
    const backAction = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }

      return false;
    };

    const handler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => handler.remove();
  }, [canGoBack]);

  // ==========================================
  // NATIVE PUSH NOTIFICATION TAP HANDLING
  // ==========================================

  useEffect(() => {
    const handleNotificationTap = (response) => {
      const data =
        response.notification.request.content.data;

      const notificationUrl = data?.url;

      if (
        typeof notificationUrl !== "string" ||
        !notificationUrl.startsWith("/") ||
        notificationUrl.startsWith("//")
      ) {
        return;
      }

      setSource({
        uri: `${WEBSITE_URL}${notificationUrl}`,
      });
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationTap
      );

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleNotificationTap(response);
        }
      })
      .catch((error) => {
        console.log(
          "Notification response error:",
          error
        );
      });

    return () => subscription.remove();
  }, []);

  // ==========================================
  // CLEANUP
  // ==========================================

  useEffect(() => {
    return () => {
      if (exchangeTimer.current) {
        clearTimeout(exchangeTimer.current);
      }
    };
  }, []);

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={SPLASH_BACKGROUND}
        barStyle="light-content"
        translucent={false}
      />

      <SafeAreaView
        style={styles.safeArea}
        edges={["top"]}
      >
        <WebView
          ref={webViewRef}
          source={source}
          style={styles.webview}

          javaScriptEnabled={true}
          domStorageEnabled={true}

          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}

          allowsBackForwardNavigationGestures={true}
          setSupportMultipleWindows={false}

          originWhitelist={["*"]}
          mixedContentMode="never"
          cacheEnabled={true}

          onMessage={handleWebViewMessage}

          onShouldStartLoadWithRequest={
            handleShouldStartLoadWithRequest
          }

          onNavigationStateChange={
            handleNavigationChange
          }

          onLoadEnd={handleLoadEnd}
          onError={handleWebViewError}
          onHttpError={handleHttpError}

          geolocationEnabled={true}
        />
      </SafeAreaView>

      {/* =====================================
          ZERIY CUSTOM SPLASH SCREEN
      ===================================== */}

      {showSplash && (
        <Animated.View
          style={[
            styles.splashScreen,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <Image
            source={require("@/assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.tagline}>
            Made Simple Much Faster
          </Text>

          <ActivityIndicator
            size="small"
            color="#FFFFFF"
            style={styles.splashLoader}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
  },

  safeArea: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
  },

  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // SPLASH SCREEN
  splashScreen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,

    backgroundColor: "#080824",

    justifyContent: "center",
    alignItems: "center",

    zIndex: 9999,
    elevation: 9999,
  },

  // LOGO
  logo: {
    width: 180,
    height: 180,
    borderRadius: 40,
    marginBottom: 18,
  },

  // TAGLINE
  tagline: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.8,
    textAlign: "center",
  },

  // LOADING SPINNER
  splashLoader: {
    marginTop: 25,
  },
});

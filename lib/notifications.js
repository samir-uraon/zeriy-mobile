
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Configure how notifications appear while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  try {
    // Push notifications require a physical device.
    if (!Device.isDevice) {
      console.log("Push notifications require a physical device.");
      return null;
    }

    // Create Android notification channel.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default Notifications",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6C3CE9",
        sound: "default",
      });
    }

    // Check existing notification permission.
    let { status, canAskAgain } =
      await Notifications.getPermissionsAsync();

    // Ask only if permission has not been granted
    // and the system allows another request.
    if (status !== "granted" && canAskAgain) {
      const permission =
        await Notifications.requestPermissionsAsync();

      status = permission.status;
    }

    if (status !== "granted") {
      console.log("Notification permission not granted.");
      return null;
    }

    // Read your EAS project ID from app.json.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    if (!projectId) {
      throw new Error("EAS project ID not found.");
    }

    // Generate Expo Push Token.
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log("Expo Push Token:", token.data);

    return token.data;
  } catch (error) {
    console.error("Push notification registration error:", error);
    return null;
  }
}

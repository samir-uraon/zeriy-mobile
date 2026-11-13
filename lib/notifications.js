
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    throw new Error(
      "Push notifications require a physical Android device."
    );
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(
      "default",
      {
        name: "Default Notifications",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6C3CE9",
      }
    );
  }

  let permission = await Notifications.getPermissionsAsync();

  if (permission.status !== "granted" && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }

  if (permission.status !== "granted") {
    throw new Error(
      "Notification permission was not granted."
    );
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error("EAS project ID not found.");
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  console.log("Expo Push Token:", token.data);

  return token.data;
}

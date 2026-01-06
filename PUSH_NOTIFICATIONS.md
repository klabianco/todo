# Push Notifications for Mobile App

Your Todo app now has full push notification support for iOS and Android using Expo's push notification service.

## Features

- Real-time push notifications for:
  - Task completions
  - Shared list updates
  - New tasks added to shared lists
  - Task reminders (scheduled tasks)
- Automatic token registration on app launch
- Deep linking - tap notifications to open specific lists
- Works alongside email notifications
- Multi-device support - notifications sent to all registered devices

## How It Works

1. **Mobile App**: Registers for push notifications and sends token to server
2. **Server**: Stores device tokens per user
3. **Events**: When tasks are updated, server sends push notifications via Expo API
4. **Delivery**: Expo delivers notifications to iOS/Android devices
5. **Interaction**: Tapping notifications opens the app at the relevant screen

## Mobile App Setup

### Dependencies

The mobile app requires these packages (already added):

```json
{
  "expo-notifications": "~0.30.0",
  "expo-device": "~7.0.4"
}
```

### Installation

```bash
cd mobile
npm install
```

### Configuration

The app is already configured in `app.json`:

```json
{
  "notification": {
    "icon": "./assets/notification-icon.png",
    "color": "#3b82f6",
    "iosDisplayInForeground": true,
    "androidMode": "default",
    "androidCollapsedTitle": "Todo Updates"
  }
}
```

### Building

For push notifications to work, you need to build the app:

**Development Build:**
```bash
cd mobile
eas build --profile development --platform ios
eas build --profile development --platform android
```

**Production Build:**
```bash
cd mobile
eas build --profile production --platform all
```

## Server-Side Setup

### API Endpoints

**Register Push Token**

`PUT /api/user/push-token`

```json
{
  "token": "ExponentPushToken[xxxxxx]",
  "platform": "ios",
  "deviceName": "John's iPhone"
}
```

**Get User's Push Tokens**

`GET /api/user/push-token`

Response:
```json
{
  "tokens": [
    {
      "token": "ExponentPushToken[xxxxxx]",
      "platform": "ios",
      "deviceName": "John's iPhone",
      "created": "2026-01-06T12:00:00Z",
      "updated": "2026-01-06T12:00:00Z"
    }
  ]
}
```

**Remove Push Token**

`DELETE /api/user/push-token`

```json
{
  "token": "ExponentPushToken[xxxxxx]"
}
```

## Sending Push Notifications

### From PHP (Server-Side)

```php
require_once 'www/api/includes/push-helpers.php';

// Send to specific user
send_push_to_user(
    $userId,
    '✅ Task Completed!',
    'Buy groceries',
    ['url' => 'https://todo.o9p.net/?share=abc123']
);

// Or use helper functions
push_notify_task_completed($userId, 'Buy groceries', $listUrl);
push_notify_shared_list_updated($userId, 'Shopping List', $listUrl, ['Task added']);
push_notify_new_shared_task($userId, 'Buy milk', 'Shopping List', $listUrl);
```

### Integration with Notifications

Push notifications are automatically sent when:

1. Email notifications are triggered
2. Tasks are completed (if preferences enabled)
3. Shared lists are updated
4. New tasks are added to shared lists

Both email and push notifications use the same:
- Rate limiting (5 minutes per event type)
- User preferences
- Event triggers

## Testing

### Test Push Notification

Use the test endpoint:

```bash
curl -X POST https://todo.o9p.net/api/test-notification \
  -H "Content-Type: application/json" \
  -d '{"type": "task_completed"}'
```

This will send both email AND push notifications (if tokens registered).

### Manual Testing

1. Install and run the mobile app on a physical device
2. Grant notification permissions when prompted
3. Check server logs to confirm token registration
4. Complete a task or use the test endpoint
5. Verify notification appears on device

## Notification Payload

Notifications sent to Expo API:

```json
{
  "to": "ExponentPushToken[xxxxxx]",
  "sound": "default",
  "title": "✅ Task Completed!",
  "body": "Buy groceries",
  "data": {
    "url": "https://todo.o9p.net/?share=abc123"
  },
  "priority": "high",
  "channelId": "default"
}
```

## Deep Linking

When a notification includes a `url` in the data payload:

1. User taps notification
2. App opens (or comes to foreground)
3. WebView navigates to the specified URL
4. User sees the relevant task list

Example deep links:
- `https://todo.o9p.net/?share=abc123` - Open shared list
- `https://todo.o9p.net/` - Open personal list

## Troubleshooting

### Notifications not received

1. **Check device is physical** - Push notifications don't work on simulators/emulators
2. **Verify permissions** - Check app has notification permissions enabled
3. **Check token registration** - Look for "Push token registered successfully" in logs
4. **Verify Expo project ID** - Must match in `app.json` and `App.js`
5. **Check Expo dashboard** - Verify push notifications are enabled for your project

### Token not registering

1. **Network issues** - Check device has internet connection
2. **Server errors** - Check server logs for API errors
3. **Cookie issues** - Ensure userId cookie is set
4. **CORS** - Verify API is accessible from app

### Notifications sent but not delivered

1. **Check Expo status** - https://status.expo.dev
2. **Verify token format** - Must start with `ExponentPushToken[` or `ExpoPushToken[`
3. **Check response** - Expo API returns ticket with status
4. **Receipt check** - Query Expo receipts API for delivery status

## Rate Limiting

Same as email notifications:
- 5 minutes between notifications of same event type
- Daily summaries: Once per day
- Prevents notification spam

## Best Practices

1. **Always request permissions** - Ask for notification permissions on first launch
2. **Handle denials gracefully** - App should work without push notifications
3. **Test on physical devices** - Never rely on simulators for push testing
4. **Monitor Expo quotas** - Free tier has limits on push notifications
5. **Handle token expiry** - Expo tokens can expire, re-register periodically
6. **Use deep links** - Always include relevant URLs in notification data
7. **Keep titles short** - Mobile notification titles should be concise
8. **Test on both platforms** - iOS and Android handle notifications differently

## Security

- Tokens are stored securely per user
- Only authenticated users can register tokens
- Tokens expire and are automatically refreshed
- Rate limiting prevents abuse
- No sensitive data in notification bodies

## Expo Push Notification Limits

**Free tier:**
- No official limit on number of notifications
- Reasonable use expected
- May be throttled if abused

**Paid tier:**
- Higher throughput
- Better reliability
- Priority delivery

See: https://expo.dev/pricing

## Advanced Features

### Custom Sounds

Add custom notification sounds:

1. Add sound file to `mobile/assets/sounds/`
2. Update notification payload:

```php
$message['sound'] = 'custom-sound.wav';
```

### Badge Count

Update app badge:

```php
$message['badge'] = 5; // Number to show on app icon
```

### Priority Levels

```php
$message['priority'] = 'high'; // or 'normal', 'default'
```

### Categories (iOS)

```php
$message['categoryId'] = 'task_completed';
```

## Files

- `/mobile/App.js` - Push notification registration and handling
- `/mobile/package.json` - Dependencies
- `/mobile/app.json` - Expo configuration
- `/www/api/includes/push-helpers.php` - Server-side push functions
- `/www/api/includes/email-helpers.php` - Integrated email + push
- `/www/api/index.php` - API endpoints for token management

## Support

For issues:
1. Check Expo documentation: https://docs.expo.dev/push-notifications/overview/
2. Verify Expo project configuration
3. Test with Expo push notification tool: https://expo.dev/notifications
4. Check server and mobile app logs
5. Review this documentation

## Future Enhancements

Potential improvements:
- Scheduled notifications (task reminders)
- Notification grouping
- Notification action buttons
- Silent notifications for background sync
- Analytics on notification delivery
- A/B testing notification content
- Notification preferences per list
- Quiet hours / do-not-disturb

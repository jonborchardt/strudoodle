# Keep the JS bridge: it is reached by name from the page, which R8 cannot see.
-keepclassmembers class com.bunnypuddlegames.strudoodle.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}

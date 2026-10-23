plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bunnypuddlegames.strudoodle"
    compileSdk = 35
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "com.bunnypuddlegames.strudoodle"
        minSdk = 26 // adaptive icons only, no raster mipmaps; the WebView itself updates via Play regardless of OS
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // No signing config yet: assembleRelease produces an unsigned APK.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // The one androidx dep, and it is load-bearing: WebViewAssetLoader serves assets/ from
    // https://appassets.androidplatform.net, a secure origin. Strudel's AudioWorklets refuse to
    // load from file:// ("non-secure origin"), so a plain loadUrl("file:///android_asset/...") is silent.
    implementation("androidx.webkit:webkit:1.12.1")
}

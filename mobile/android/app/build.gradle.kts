import groovy.json.JsonOutput
import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    // Lint crashes on a newer AndroidX library (NonNullableMutableLiveDataDetector); skip it for release.
    lint { checkReleaseBuilds = false }
    namespace = "app.rye.browser"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.rye.browser"
        minSdk = 26
        // 34 keeps the classic status and navigation bars.
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        // Phones made in the last decade; keeps the download small.
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the build machine's debug key so it installs directly.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/ryeAssets"))
}

// Rye's pages, shared with the desktop build, become a built-in GeckoView
// extension. Its manifest is rewritten for Firefox's engine.
val ryePages = tasks.register("ryePages") {
    val source = rootProject.file("../../chromium/extensions/rye-newtab")
    val target = layout.buildDirectory.dir("generated/ryeAssets/rye")
    inputs.dir(source)
    outputs.dir(target)
    doLast {
        val out = target.get().asFile
        out.deleteRecursively()
        source.copyRecursively(out, overwrite = true)
        @Suppress("UNCHECKED_CAST")
        val manifest = JsonSlurper().parse(File(source, "manifest.json")) as MutableMap<String, Any?>
        manifest.remove("key")
        manifest.remove("chrome_url_overrides")
        manifest["manifest_version"] = 2
        manifest["permissions"] = listOf("storage", "unlimitedStorage", "nativeMessaging", "geckoViewAddons")
        manifest["browser_specific_settings"] = mapOf("gecko" to mapOf("id" to "rye@rye.app"))
        File(out, "manifest.json").writeText(JsonOutput.prettyPrint(JsonOutput.toJson(manifest)))
    }
}
tasks.named("preBuild") { dependsOn(ryePages) }

dependencies {
    // Firefox 140 ESR's engine; newer GeckoView needs Android Gradle plugin 9 and SDK 37.
    implementation("org.mozilla.geckoview:geckoview:[140.0,141.0)")
    implementation("androidx.activity:activity-ktx:1.9.3")
}

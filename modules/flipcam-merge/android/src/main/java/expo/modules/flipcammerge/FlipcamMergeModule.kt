package expo.modules.flipcammerge

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

@OptIn(UnstableApi::class)
class FlipcamMergeModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("FlipcamMerge")

    AsyncFunction("mergeVideosAsync") { inputs: List<String>, output: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      if (inputs.isEmpty()) {
        promise.reject("ERR_NO_INPUT", "No input videos", null)
        return@AsyncFunction
      }

      // Transformer must be created and started on a thread with a Looper.
      mainHandler.post {
        try {
          val outPath = output.removePrefix("file://")
          File(outPath).delete()

          // Force every clip to the same portrait size so front/back cameras
          // (which can differ in resolution/orientation) join cleanly.
          val items = inputs.map { path ->
            val uri = if (path.startsWith("file://")) Uri.parse(path) else Uri.fromFile(File(path))
            EditedMediaItem.Builder(MediaItem.fromUri(uri))
              .setEffects(
                Effects(
                  listOf(),
                  listOf(
                    Presentation.createForWidthAndHeight(
                      1080, 1920, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP
                    )
                  )
                )
              )
              .build()
          }

          val sequence = EditedMediaItemSequence.Builder(*items.toTypedArray()).build()
          val composition = Composition.Builder(sequence).build()

          val transformer = Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(object : Transformer.Listener {
              override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                promise.resolve(outPath)
              }

              override fun onError(
                composition: Composition,
                exportResult: ExportResult,
                exportException: ExportException
              ) {
                promise.reject("ERR_MERGE", exportException.message ?: "Merge failed", exportException)
              }
            })
            .build()

          transformer.start(composition, outPath)
        } catch (e: Exception) {
          promise.reject("ERR_MERGE", e.message ?: "Merge failed", e)
        }
      }
    }
  }
}

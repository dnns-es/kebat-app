package es.dnns.kebat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Botón atrás de Android: lo decide la app (volver a la carta, al carrito...).
     *  En la carta se manda a segundo plano sin cerrarla. */
    @Override
    public void onBackPressed() {
        getBridge().getWebView().evaluateJavascript(
                // App es un const del script, no una propiedad de window: se mira con typeof
                "(typeof App !== 'undefined' && App.atras) ? String(App.atras()) : 'false'",
                v -> { if (!"\"true\"".equals(v)) moveTaskToBack(true); });
    }
}

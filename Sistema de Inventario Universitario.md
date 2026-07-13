# Sistema de Inventario Universitario

# Resumen General

## Objetivo del sistema

Desarrollar un sistema web para la administración integral del inventario de la universidad, sustituyendo el control manual realizado mediante hojas de cálculo por una plataforma centralizada, segura, escalable y fácil de administrar.

El sistema permitirá gestionar los productos del inventario, controlar las entradas y salidas de materiales, mantener un historial completo de movimientos, generar reportes, administrar usuarios y permisos, importar y exportar información desde archivos de Excel y servir como base para futuras funcionalidades como impresión de etiquetas, escaneo mediante códigos QR o códigos de barras, administración de múltiples almacenes e integración con otros sistemas institucionales.

Más que registrar cantidades disponibles, el sistema buscará garantizar la trazabilidad completa de cada artículo durante todo su ciclo de vida.

---

# Filosofía del sistema

El sistema estará basado en un principio fundamental:

> **El historial de movimientos constituye la fuente de verdad del inventario.**

Toda modificación de existencias deberá realizarse mediante un movimiento registrado dentro del sistema. El inventario disponible de cada producto será un dato derivado de dichos movimientos y se actualizará automáticamente para optimizar el rendimiento de las consultas.

### Ejemplo

```text
Laptop Dell

Entrada      +10
Salida        -2
Salida        -1
Entrada       +5

Inventario actual = 12
```

Este enfoque permitirá conocer en cualquier momento:

- Qué producto fue modificado.
- Qué usuario realizó la operación.
- Cuándo ocurrió.
- Qué tipo de movimiento se realizó.
- El motivo del movimiento.
- La existencia anterior y posterior.
- El historial completo del producto.

Esta arquitectura facilita las auditorías, reduce errores humanos y garantiza la integridad de la información.

---

# Arquitectura general del sistema

El sistema estará dividido en módulos independientes para facilitar su mantenimiento, escalabilidad y futuras ampliaciones.

## Dashboard

Pantalla principal con indicadores generales del inventario.

### Indicadores principales

- Total de productos registrados.
- Categorías existentes.
- Entradas del día.
- Salidas del día.
- Productos con inventario bajo.
- Productos agotados.
- Movimientos recientes.
- Actividad reciente del sistema.

---

# Productos

Representa cada artículo administrado dentro del inventario.

Cada producto contará con información como:

- Código interno.
- Descripción.
- Categoría.
- Unidad de medida.
- Marca.
- Ubicación.
- Observaciones.
- Código QR.
- Código de barras.
- Stock mínimo.
- Estado del producto (Activo, Inactivo, Obsoleto, etc.).

El sistema mantendrá automáticamente el inventario disponible a partir del historial de movimientos.

Cada producto conservará permanentemente su historial de operaciones (Kardex).

---

# Catálogos configurables

Con el objetivo de evitar modificaciones al sistema conforme evolucionen las necesidades de la universidad, los principales catálogos serán completamente configurables desde la interfaz administrativa.

Inicialmente se administrarán:

- Categorías.
- Unidades de medida.
- Marcas.
- Motivos de movimientos.
- Ubicaciones.

Cada catálogo podrá ser ampliado, editado o deshabilitado sin necesidad de modificar el código fuente.

---

# Ubicaciones jerárquicas

Las ubicaciones no serán simples registros independientes, sino que estarán organizadas mediante una estructura jerárquica configurable.

Cada ubicación podrá contener otras ubicaciones, permitiendo representar cualquier distribución física de la universidad.

## Ejemplo

```text
Universidad
└── Edificio A
    └── Planta Baja
        └── Almacén
            └── Pasillo 1
                └── Estante A
                    └── Nivel 2
```

De esta forma será posible representar:

- Campus
- Edificios
- Pisos
- Almacenes
- Laboratorios
- Pasillos
- Estantes
- Niveles
- Cajones

o cualquier otra subdivisión física sin limitar la profundidad de la estructura.

Esta arquitectura permitirá reorganizar físicamente el inventario sin modificar el diseño del sistema.

---

# Movimientos de inventario

Es el módulo principal del sistema.

Toda modificación del inventario generará automáticamente un movimiento.

## Tipos iniciales

- Entrada.
- Salida.
- Ajuste positivo.
- Ajuste negativo.

## Tipos contemplados a futuro

- Transferencias.
- Préstamos.
- Devoluciones.
- Traspasos entre almacenes.

Cada movimiento almacenará:

- Producto.
- Tipo de movimiento.
- Cantidad.
- Fecha y hora.
- Usuario responsable.
- Motivo.
- Observaciones.
- Documento relacionado (opcional).

---

# Kardex

Cada producto contará con un historial cronológico de movimientos.

El Kardex permitirá consultar:

- Entradas.
- Salidas.
- Ajustes.
- Existencia resultante.
- Usuario responsable.
- Motivo.
- Fecha de cada operación.

Este historial constituirá el respaldo histórico del inventario.

---

# Control de inventario mínimo

Cada producto tendrá configurado su propio stock mínimo.

Cuando la existencia sea igual o inferior al valor establecido, el sistema generará automáticamente una alerta de inventario bajo.

Adicionalmente existirá un **stock mínimo por defecto** dentro de la configuración general del sistema.

Este valor únicamente será utilizado como referencia al crear nuevos productos y podrá modificarse individualmente para cada artículo.

### Ejemplo

| Producto | Stock mínimo |
|----------|-------------:|
| Papel Bond | 500 |
| Laptop | 2 |
| Mouse | 20 |

---

# Alertas

Inicialmente el sistema notificará:

- Inventario bajo.
- Productos agotados.

La arquitectura permitirá incorporar posteriormente alertas adicionales como:

- Productos sin movimientos durante determinado periodo.
- Productos duplicados.
- Códigos repetidos.
- Entradas inusuales.
- Salidas excesivas.
- Inconsistencias detectadas durante importaciones.

---

# Importación desde Excel

El sistema contará con un asistente de importación para facilitar la migración de información.

## Flujo

1. Seleccionar archivo.
2. Seleccionar hoja.
3. Relacionar columnas.
4. Validar información.
5. Mostrar vista previa.
6. Confirmar importación.

## Validaciones

Durante la validación se detectarán posibles inconsistencias como:

- Códigos duplicados.
- Categorías inexistentes.
- Unidades inexistentes.
- Marcas inexistentes.
- Ubicaciones inexistentes.
- Cantidades inválidas.
- Datos incompletos.

## Opciones configurables

El usuario podrá decidir si desea crear automáticamente información inexistente.

Ejemplo:

- ☑ Crear categorías nuevas.
- ☑ Crear unidades nuevas.
- ☐ Crear marcas nuevas.
- ☐ Crear ubicaciones nuevas.

Cuando la creación automática esté deshabilitada, el sistema mostrará sugerencias inteligentes utilizando coincidencias de texto.

### Ejemplo

```text
Categoría encontrada:

papeleria

¿Quizás quiso decir?

✓ Papelería
```

Con esto se reducirá significativamente la creación accidental de registros duplicados por diferencias de escritura.

---

# Exportación de información

El sistema permitirá exportar información en diferentes formatos.

## Formatos

- Excel (.xlsx)
- CSV
- PDF

## Tipos de exportación

- Inventario completo.
- Historial de movimientos.
- Productos con inventario bajo.
- Resultados de una búsqueda.
- Información filtrada.

La exportación respetará siempre los filtros y criterios de búsqueda aplicados por el usuario, permitiendo obtener únicamente la información visible en pantalla.

---

# Códigos QR y códigos de barras

Cada producto contará con un identificador único.

A partir de dicho identificador el sistema podrá generar:

- Código QR.
- Código de barras.

Estos identificadores facilitarán:

- Localización rápida del producto.
- Registro de movimientos mediante escaneo.
- Impresión de etiquetas.
- Integraciones con aplicaciones móviles.

---

# Etiquetas

Aunque inicialmente no se contempla la impresión, el sistema quedará preparado para generar etiquetas personalizadas.

Cada etiqueta podrá contener:

- Nombre del producto.
- Código interno.
- Código QR.
- Código de barras.

Posteriormente podrán incorporarse distintos formatos según el tipo de impresora utilizada.

---

# Usuarios, roles y permisos

El sistema utilizará autenticación de usuarios.

Inicialmente existirá un usuario administrador; sin embargo, toda la infraestructura quedará preparada para administrar múltiples usuarios.

Los permisos estarán desacoplados de los roles.

Cada permiso representará una acción específica.

## Ejemplos de permisos

### Productos

- Ver productos.
- Crear productos.
- Editar productos.
- Eliminar productos.

### Movimientos

- Registrar entradas.
- Registrar salidas.
- Ver movimientos.
- Modificar movimientos.
- Eliminar movimientos.

### Configuración

- Administrar usuarios.
- Administrar roles.
- Importar información.
- Exportar información.
- Configurar sistema.
- Imprimir etiquetas.

Los roles únicamente agruparán permisos, permitiendo crear nuevos perfiles sin necesidad de modificar el sistema.

---

# Búsqueda y filtros

Toda la información podrá localizarse mediante búsqueda en tiempo real.

## Búsqueda global

- Código.
- Descripción.
- Marca.
- Categoría.
- Ubicación.

## Filtros

- Categoría.
- Ubicación.
- Marca.
- Unidad de medida.
- Estado.
- Inventario bajo.
- Sin existencias.

---

# Auditoría

El sistema registrará automáticamente los cambios relevantes realizados por los usuarios.

Cada registro incluirá:

- Usuario.
- Fecha y hora.
- Acción realizada.
- Valor anterior.
- Valor nuevo.

Esto permitirá mantener trazabilidad sobre todas las modificaciones importantes.

---

# Configuración general

El sistema contará con un módulo de configuración para definir parámetros generales como:

- Nombre de la universidad.
- Logotipo institucional.
- Prefijo de códigos.
- Stock mínimo por defecto.
- Parámetros de impresión de etiquetas.
- Configuración de códigos.
- Parámetros generales del sistema.

---

# Funcionalidades futuras

La arquitectura estará preparada para incorporar nuevas funcionalidades sin afectar la lógica existente.

Entre ellas:

- Múltiples almacenes.
- Inventarios físicos.
- Solicitudes internas de materiales.
- Préstamos entre departamentos.
- Transferencias entre almacenes.
- Aprobación de movimientos.
- Fotografías de productos.
- Documentos adjuntos.
- Gestión de proveedores.
- Órdenes de compra.
- Reportes estadísticos.
- Notificaciones automáticas.
- Integración con otros sistemas universitarios.

---

# Arquitectura tecnológica propuesta

| Componente | Tecnología |
|------------|------------|
| Backend | Django + Django REST Framework |
| Frontend | React o Next.js |
| Base de datos | PostgreSQL |
| Autenticación | Sistema de usuarios y permisos de Django |
| Importación y exportación | OpenPyXL + Pandas |
| QR y códigos de barras | Bibliotecas especializadas compatibles con Django |
| Etiquetas | Módulo desacoplado para soportar distintos modelos de impresoras |

---

# Conclusión

La propuesta busca ir más allá de digitalizar un archivo de Excel. Se plantea una plataforma de gestión de inventario moderna, auditable y preparada para evolucionar con las necesidades de la universidad.

La base del sistema será el registro de movimientos como fuente de verdad, complementado con catálogos configurables, ubicaciones jerárquicas, permisos flexibles y procesos inteligentes de importación y exportación.

Esta arquitectura permitirá incorporar nuevas funcionalidades y adaptar el sistema a cambios organizacionales sin requerir modificaciones significativas en el código o en la estructura de la base de datos, garantizando una solución escalable, mantenible y sostenible a largo plazo.
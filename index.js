const express = require('express');
const moongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const autoRoutes = require('./routes/routes.autos');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_URI = 'mongodb://localhost:27017/db';

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use('/api', autoRoutes);

// Conexión a la base de datos
moongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Conectado a la base de datos'))
    .catch(err => console.error('Error de conexión a la base de datos:', err));

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

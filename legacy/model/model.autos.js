const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const autoSchema = new Schema({
    marca: { type: String, required: true },
    modelo: { type: String, required: true },
    puertas: { type: Number, required: true },
    motor: { type: String, required: true },
    pasajeros: { type: Number, required: true },
    llantas: { type: String, required: true },
    transmision: { type: String, required: true }
});
module.exports = mongoose.model('Auto', autoSchema);

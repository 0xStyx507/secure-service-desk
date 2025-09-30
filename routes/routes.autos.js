const express = require('express');
const router = express.Router();
const Auto = require('../model/model.autos');


// Crear un nuevo auto
router.post('/autosC', async (req, res) => {
    try {
        const auto = new Auto(req.body);
        await auto.save();
        res.status(201).send(auto);
    } catch (error) {
        res
            .status(400)
            .send({ message: 'Error al crear el auto', error: error.message });
    }
});

// Obtener todos los autos
router.get('/autos', async (req, res) => {
    try {
        const autos = await Auto.find();
        res.status(200).send(autos);
    }
    catch (error) {
        res
            .status(500)
            .send({ message: 'Error al obtener los autos', error: error.message });
    }
});
// Obtener un auto por ID
router.get('/autosS/:id', async (req, res) => {
    try {



        const auto = await Auto.findById(req.params.id);
        if (!auto) {
            return res.status(404).send({ message: 'Auto no encontrado' });
        }
        res.status(200).send(auto);
    }
    catch (error) {

        res
            .status(500)
            .send({ message: 'Error al obtener el auto', error: error.message });
    }
});

// Actualizar un auto por ID
router.put('/autosU/:id', async (req, res) => {
    try {
        const auto = await Auto.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!auto) {
            return res.status(404).send({ message: 'Auto no encontrado' });
        }   
        res.status(200).send(auto);
    } catch (error) {
        res
            .status(400)
            .send({ message: 'Error al actualizar el auto', error: error.message });
    }              
});

// Eliminar un auto por ID
router.delete('/autosD/:id', async (req, res) => {
    try {
        const auto = await Auto.findByIdAndDelete(req.params.id);
        if (!auto) {
            return res.status(404).send({ message: 'Auto no encontrado' });
        }
        res.status(200).send({ message: 'Auto eliminado correctamente' });
    } catch (error) {
        res
            .status(500)
            .send({ message: 'Error al eliminar el auto', error: error.message });
    }
});
module.exports = router;
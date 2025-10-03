
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Auto = require('../model/model.autos');


router.post('/autos', async (req, res) => {
  try {
    const auto = new Auto(req.body);
    await auto.save();
    res.status(201).send(auto);
  } catch (error) {
    res.status(400).send({ message: 'Error al crear el auto', error: error.message });
  }
});


router.get('/autos', async (req, res) => {
  try {
    const autos = await Auto.find();
    res.status(200).send(autos);
  } catch (error) {
    res.status(500).send({ message: 'Error al obtener los autos', error: error.message });
  }
});


router.get('/autos/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'ID inválido' });
  }
  try {
    const auto = await Auto.findById(req.params.id);
    if (!auto) return res.status(404).send({ message: 'Auto no encontrado' });
    res.status(200).send(auto);
  } catch (error) {
    res.status(500).send({ message: 'Error al obtener el auto', error: error.message });
  }
});


router.put('/autos/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'ID inválido' });
  }
  try {
    const auto = await Auto.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!auto) return res.status(404).send({ message: 'Auto no encontrado' });
    res.status(200).send(auto);
  } catch (error) {
    res.status(500).send({ message: 'Error al actualizar el auto', error: error.message });
  }
});




router.delete('/autos/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'ID inválido' });
  }
  try {
    const auto = await Auto.findByIdAndDelete(req.params.id);
    if (!auto) return res.status(404).send({ message: 'Auto no encontrado' });
    res.status(204).send();
  } catch (error) {
    res.status(500).send({ message: 'Error al eliminar el auto', error: error.message });
  }
});

module.exports = router;
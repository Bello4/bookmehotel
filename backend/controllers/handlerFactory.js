const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');

// REFRACTURING SOME FEW CODES 



exports.deleteOne = Model => catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });

});



exports.updateOne = Model => catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      doc
    });
 
});


exports.createOne = Model => catchAsync(async (req, res, next) => {

    // const newTour = new Tour({})
      // newTour.save()
  
      const doc = await Model.create(req.body);
  
      res.status(201).json({
        status: 'success',
        doc
      });
  
});



exports.getOne = (Model, popOptions) => catchAsync(async (req, res, next) => {
    
    let query = Model.findById(req.params.id);
    if (popOptions) query = query.populate(popOptions);
    
    const hotel = await query;
    
    if (!hotel) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      hotel
    });
 
});


exports.getAll = Model => catchAsync(async (req, res, next) => {
  
    // to allow for nested get reviews on tour
    const data = await Model.find()

    // SEND RESPONSE
    res.status(200).json({
      status: 'success',
      results: data.length,
      data
    });
 
});


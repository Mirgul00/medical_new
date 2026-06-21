def success_response(**extra):
    response = {"success": True}
    response.update(extra)
    return response


def not_found_response(message="Not found"):
    return {
        "success": False,
        "message": message,
    }


def get_by_id(db, model, item_id):
    return db.query(model).filter(model.id == item_id).first()


def update_fields(item, fields):
    for field, value in fields.items():
        setattr(item, field, value)


def patch_fields(item, fields):
    for field, value in fields.items():
        if value is not None:
            setattr(item, field, value)

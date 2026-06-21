from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from database import Base



class Appointment(Base):

    __tablename__ = "appointments"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    name = Column(String)

    phone = Column(String)

    procedure = Column(String)

    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)

    procedure_snapshot = Column(String, default="")

    price_snapshot = Column(String, default="")

    date = Column(String)

    time = Column(String)

    comment = Column(String)


    status = Column(
        String,
        default="new"
    )

class Service(Base):

    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String)

    description = Column(String)

    price = Column(String)

    duration = Column(String, default="")

    category = Column(String, default="")

    image = Column(String, default="")

    active = Column(Boolean, default=True)


class ScheduleSetting(Base):

    __tablename__ = "schedule_settings"

    id = Column(Integer, primary_key=True, index=True)

    work_days = Column(String, default="1,2,3,4,5")

    start_time = Column(String, default="09:00")

    end_time = Column(String, default="16:00")

    break_start = Column(String, default="")

    break_end = Column(String, default="")


class ClosedSlot(Base):

    __tablename__ = "closed_slots"

    id = Column(Integer, primary_key=True, index=True)

    date = Column(String)

    time = Column(String)

    reason = Column(String, default="")


class ClientNote(Base):

    __tablename__ = "client_notes"

    id = Column(Integer, primary_key=True, index=True)

    phone = Column(String, unique=True, index=True)

    note = Column(String, default="")


class Certificate(Base):

    __tablename__ = "certificates"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String)

    year = Column(String)

    description = Column(String)

    image = Column(String, default="assets/img/about-img.png")

    tags = Column(String, default="")

    active = Column(Boolean, default=True)


class SiteSetting(Base):

    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, index=True)

    key = Column(String, unique=True, index=True)

    value = Column(String, default="")


class Review(Base):

    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String)

    text = Column(String)

    rating = Column(Integer, default=5)

    image = Column(String, default="")


class BeforeAfterCase(Base):

    __tablename__ = "before_after_cases"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String)

    description = Column(Text, default="")

    procedure = Column(String, default="")

    result = Column(Text, default="")

    before_image = Column(String, default="")

    after_image = Column(String, default="")

    active = Column(Boolean, default=True)


class AdminUser(Base):

    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, unique=True, index=True)

    password_hash = Column(String)
